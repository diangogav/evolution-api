# Seasons, ranks and points

## Season

A season is a plain integer that scopes points, ratings and (transitively)
tiers. There is no `seasons` table or season-switch endpoint in this API: the
current season is the `SEASON` environment variable, read once into
`config.season` (`src/config/index.ts:54`). Every route that accepts a
`season` query parameter defaults to it, for example
`GET /users/{userId}/stats` and `GET /stats` (`t.Number({ default:
config.season })` in `src/server/routes/user-router.ts:320` and
`src/server/routes/leaderboard-router.ts:64`).

Rolling to a new season is an operational action (bump `SEASON` and restart),
not an API call — see `docs/operations.md` (planned) for how deploys apply it.
Every ladder starts empty for a new season number because points, ratings and
tiers are all keyed by `(user, rank, season)`.

## Ranks: ban lists, format ladders, and Global

A "rank" is a row in `RankEntity` (`src/evolution-types/src/entities/RankEntity.ts`):

| Column | Meaning |
| --- | --- |
| `name` | The ban list or ladder name shown to clients (`banListName` in API responses), e.g. `2026.09 TCG`, `Edison`, `Global`. |
| `type` | `banlist`, `group` or `global` — exposed as `rankType` on rating entries (`UserStatsPostgresRepository.findRatings`, `src/modules/stats/infrastructure/UserStatsPostgresRepository.ts:91`). |
| `enabled` | Whether the rank is active. |
| `onlyCurrent` | Reserved flag on the entity; not read anywhere in `src/modules` at the time of writing. |

`RankMemberEntity` (`src/evolution-types/src/entities/RankMemberEntity.ts`)
links a `group` rank to the `banlist` ranks it aggregates, via a `pattern`
column. A pattern is either an exact ban list name, or `"* <suffix>"`, which
matches every ban list name ending in `" <suffix>"`
(`src/shared/ranks/RankMemberPatterns.ts`). `BanListGrouper.group`
(`src/modules/ban-list/domain/BanListGrouper.ts`) uses this to build the tree
`GET /ban-lists/grouped` returns: `global` ranks first, then each `group` with
its matched `banlist` members, then any `banlist` that belongs to no group.

In short:

- **`banlist`** — one dated or named format snapshot a match is actually
  played under (e.g. `2010.03 Edison`, `JTP`).
- **`group`** — a format ladder that aggregates several ban lists over time
  (e.g. `Edison` grouping every dated Edison ban list). A player's stats and
  rating for the group are stored directly against the group's own `rankId`
  (its own `player_stats`/`player_ratings` rows), not computed by merging the
  member ban lists' rows. On `GET /users/{userId}/stats`, a group's rating
  entry additionally carries a `members` array listing the matching ban list
  names, attached for display only (`RatingMembers.attach`,
  `src/modules/stats/domain/RatingMembers.ts`).
- **`global`** — the `Global` rank. It has no tier ladder
  (`tier` is `null` for it, per `ranked-tiers.md`), and the leaderboard
  route's `banListName` defaults to it (`src/server/routes/leaderboard-router.ts:64`
  region; see also `ranked-tiers.md` section 1).

## How season points are computed

Points are **not** computed live from the ledger for the leaderboard or
profile: they are read from `player_stats`, a table this API and the game
server both write, keyed by `(user_id, rank_id, season)`. Two read paths:

- `GET /users/{userId}/stats?season=` — `UserStatsPostgresRepository.find`
  reads one `player_stats` row per rank the user has, joins `ranks` and
  `users`, and computes a `RANK() OVER (...)` window for `position`
  (`src/modules/stats/infrastructure/UserStatsPostgresRepository.ts:19-68`).
  Ratings are a separate query against `player_ratings` (`findRatings`,
  same file, lines 84-124); a `provisional` flag is derived per rating (see
  [points-ledger-and-ratings.md](points-ledger-and-ratings.md)).
- `GET /stats?banListName=&season=` (the leaderboard) — one paginated,
  `ROW_NUMBER()`-ordered query over `player_stats` joined to `ranks`, `users`
  and (for the best `rating` per user/rank/season) `player_ratings`
  (`UserStatsPostgresRepository.leaderboard`, same file, lines 135-231). Sort
  is by `points` (default) or by `rating`, both descending, tie-broken by win
  rate.

`player_stats` itself is a **projection**, not a source of truth: this API
recomputes it from `points_ledger` whenever it needs to reconcile after an
annulment or reinstatement (`reprojectPlayerStats`,
`src/modules/points-ledger/infrastructure/PointsLedgerPostgresRepository.ts:98-135`).
See [points-ledger-and-ratings.md](points-ledger-and-ratings.md) for how the
ledger rows themselves are produced (mostly by the game server) and replayed.

**Achievements** add extra points on top of the ledger projection: the
reprojection query sums `achievements.earned_points` for the user's unlocked
achievements matching the rank's ban list name as a label
(`ACHIEVEMENT_POINTS_QUERY`, same file, lines 30-33), and both the profile and
leaderboard queries attach the matching achievement objects
(`UserStatsPostgresRepository.ts:41-59`, `171-185`).

### Player of the week

`GET /stats/player-of-the-week` (`src/server/routes/leaderboard-router.ts:72`)
returns the top scorer(s) of the **last fully completed UTC calendar week**
(Monday–Sunday), computed with a single SQL query directly against the
`matches` table — not `player_stats` or the ledger
(`UserStatsPostgresRepository.getBestPlayerOfLastCompletedWeek`, same file,
lines 233-295). It sums `matches.points` per user for that week, excludes
`anulled = true` and soft-deleted matches and users, and returns every user
tied for rank 1 (`DENSE_RANK() ... WHERE rank = 1`). Because it reads `matches`
directly, a match annulled after the week closed changes this result on the
next call — there is no caching.
