# Domain concepts

This section explains the game and platform concepts behind the API, for a
developer who knows the [architecture](../architecture.md) but not yet why the
system behaves the way it does. Each page cites the file that proves its
claims; when in doubt, read the cited file.

See also: [architecture.md](../architecture.md) for module layout, the two
DataSources and Swagger; [ranked-tiers.md](../ranked-tiers.md) for the full
client-facing tier integration guide (endpoints, the `tier` object, rendering
rules).

## Pages

| Page | Covers |
| --- | --- |
| [seasons-ranks-points.md](seasons-ranks-points.md) | Seasons, `RankEntity`/`RankMemberEntity`, ban lists vs grouped ladders vs Global, how season points feed the leaderboard and player of the week |
| [points-ledger-and-ratings.md](points-ledger-and-ratings.md) | `points_ledger` rows, how `player_stats` is derived from them, Elo ratings, provisional ratings, peaks, and who writes what (this API vs the game server) |
| [match-annulment.md](match-annulment.md) | The annulment/reversal batch flow, per-game outcomes, the `ANNULMENT_ENABLED` switch, idempotency |
| [moderation.md](moderation.md) | User bans: active ban, history, permanent vs expiring, `banGuard`, admin-only routes, and how bans relate to annulment |
| [cosmetics.md](cosmetics.md) | Catalog, entitlements, loadout slots, standard cosmetics, signed asset URLs |
| [tournaments.md](tournaments.md) | Lightning tournaments: what the upstream tournaments service owns vs what this API stores locally, the webhook, the proxy shape |

**Ranked tiers.** Tiers (Rookie through Master) are their own client-facing
guide, already written: [ranked-tiers.md](../ranked-tiers.md). This section
only explains where the *inputs* to a tier come from (season points, ranks,
games); it does not repeat the ladder rules.

## Glossary

| Term | Meaning |
| --- | --- |
| Season | An integer that scopes points, ratings and tiers. The current season is the `SEASON` env var (`src/config/index.ts`), used as the default `season` query parameter across routes. See [seasons-ranks-points.md](seasons-ranks-points.md). |
| Ban list / ladder / format | A named ruleset a match is played under (e.g. `2026.09 TCG`, `Edison`, `GOAT`). Stored as a `RankEntity` row; "ban list", "ladder" and "format" are used interchangeably in the code and this doc. |
| Rank | The `RankEntity` row itself: a ban list, a grouped format ladder, or `Global`. Distinguished by `RankEntity.type` (`rankType` in API responses): `banlist`, `group` or `global`. |
| Points | Wins/losses/points accumulated per user, per rank, per season — the leaderboard's `points`. Persisted in `player_stats`, replayed from `points_ledger`. |
| Rating / Elo | A per-(user, rank, season) Elo-style number in `player_ratings`, adjusted per match by the game server and compensated by this API on annulment/reinstatement. |
| Ledger | `points_ledger`: one immutable row per points effect on a match (`applied`, `reversal`, `reinstatement`). `player_stats` is a projection of these rows, never edited directly. |
| Annulment | Marking a match `anulled = true` and reversing the points/rating effects it produced, without deleting the match. |
| Reinstatement | Undoing an annulment: un-flagging the match and re-applying the points/rating effects it produced. |
| Tier | The Rookie-to-Master badge computed live from a player's ledger history for one rank/season. See [ranked-tiers.md](../ranked-tiers.md). |
| Entitlement | A granted access right — either a cosmetic tier (`TIER`) or a specific cosmetic (`COSMETIC`) — recorded with a `source` and an optional expiry. See [cosmetics.md](cosmetics.md). |
| Loadout | A player's currently equipped cosmetics, at most one per slot (cosmetic type: sleeve, playmat, avatar, ...). See [cosmetics.md](cosmetics.md). |
