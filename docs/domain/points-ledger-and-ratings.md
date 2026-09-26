# Points ledger and Elo ratings

Two parallel append-only histories back a player's numbers: `points_ledger`
(wins/losses/points) and `rating_history` (Elo). Both follow the same shape —
every effect on a match is its own immutable row, and the "current" value is a
replay of those rows, never edited in place.

## Who writes what

This API and the game server (`EDOpro-server-ts`) share the same Postgres
schema (`src/evolution-types/`) but write different things:

| Data | Written by | Evidence |
| --- | --- | --- |
| A new match's `points_ledger` row (`kind = 'applied'`) | Game server, when a duel finishes | `EDOpro-server-ts/src/plugins/basic-stats/application/BasicStatsCalculator.ts` |
| A new match's `rating_history` row (`kind = 'applied'`) and the resulting `player_ratings` update | Game server, via its Elo plugin | `EDOpro-server-ts/src/plugins/elo-rating/application/EloRatingCalculator.ts`, `EDOpro-server-ts/src/shared/stats/rating/infrastructure/RatingPostgresRepository.ts` |
| The `matches` row itself (game outcome, `anulled` flag) | Game server creates it; this API only flips `anulled`/`anulled_*` columns on annulment | `EDOpro-server-ts/src/evolution-types/src/entities/MatchResumeEntity.ts` (the entity mapped to the `matches` table); `src/modules/match-annulment/infrastructure/MatchAnnulmentPostgresRepository.ts:17-18` (`ANNUL_GATE_QUERY`/`UNANNUL_GATE_QUERY`) |
| `reversal` and `reinstatement` rows in both ledgers, and the `player_stats`/`player_ratings` reprojection that follows them | This API, only through match annulment/reinstatement | `src/modules/match-annulment/infrastructure/MatchAnnulmentPostgresRepository.ts`, `src/modules/rating/infrastructure/RatingCompensationPostgresRepository.ts` |

In other words: this API never grants or removes points/rating for a match
that was actually played — it only ever *reverses* or *re-applies* what the
game server already wrote. See
[match-annulment.md](match-annulment.md) for the batch flow that produces
`reversal`/`reinstatement` rows.

## Points ledger

`PointsLedgerEntity` (`src/evolution-types/src/entities/PointsLedgerEntity.ts`)
has one row per `(game_id, user_id, rank_id, kind, cycle)`, enforced by a
unique index. `kind` is `applied | reversal | reinstatement`; `cycle` counts
annul/reinstate round trips for the same match and key, so a match that gets
annulled, reinstated, then annulled again produces distinct rows instead of
colliding (`nextCycle`, `src/modules/points-ledger/domain/PointsProjection.ts:28-32`).

`player_stats` (wins, losses, points shown on the leaderboard) is a
**projection** of these rows plus achievement points, computed by
`projectPlayerStats` (`src/modules/points-ledger/domain/PointsProjection.ts:9-24`):
a plain sum of `winsDelta`/`lossesDelta`/`pointsDelta` — no clamping, so a
player's points can go negative. This API recomputes and upserts
`player_stats` under an advisory lock whenever it touches the ledger for a
`(user, rank, season)` key (`reprojectPlayerStats`,
`src/modules/points-ledger/infrastructure/PointsLedgerPostgresRepository.ts:98-135`).

## Elo ratings

`PlayerRatingEntity` (`src/evolution-types/src/entities/PlayerRatingEntity.ts`)
holds the "live" rating per `(user, rank, season)`: `rating`, `gamesPlayed`,
and `peak` (a running maximum), all defaulting to `1000`.
`RatingHistoryEntity` (`src/evolution-types/src/entities/RatingHistoryEntity.ts`)
is the append-only history, one row per `(match, user, rank, kind, cycle)`,
each storing `previousRating`, `delta`, `kFactor` and `opponentRating`.

Two constants govern replay (`src/modules/rating/domain/RatingProjection.ts`):

- `INITIAL_RATING = 1000` — the rating before any match, mirroring the game
  server's own default.
- `RATING_FLOOR = 100` — the lowest a rating can be projected to. A loss
  always costs at least one point, so without a floor a long losing streak
  would walk a rating through zero into negative numbers.

`projectRating` (same file, lines 46-67) replays a user's history into
`{ rating, gamesPlayed, peak }`: `rating` and `peak` are a plain sum/running
max over `delta` (each row already stores the amount its rating actually
absorbed, so summing needs no floor of its own); `gamesPlayed` is
`applied - reversal + reinstatement`, clamped to zero.

**Floor math happens once, at write time.** `effectiveDelta(rating, delta)`
(same file, lines 32-34) returns `max(RATING_FLOOR, rating + delta) - rating`
— the part of a requested delta the rating can actually take. When
`RatingCompensationPostgresRepository.insertReversal`/`insertReinstatement`
write a new row, they replay the user's current history under a Postgres
advisory lock (`pg_advisory_xact_lock`, keyed by user/rank/season — works even
before a `player_ratings` row exists, unlike a row-level lock), compute the
live rating, pass the requested delta through `effectiveDelta`, and store only
the absorbed amount (`src/modules/rating/infrastructure/RatingCompensationPostgresRepository.ts:110-153`,
`155-190`). This keeps `previousRating + storedDelta` always equal to the
resulting rating, so replaying rows never mints or loses points to a
truncated floor.

### Provisional ratings and peaks

A rating is **provisional** when the player has fewer than 10 games in that
`(rank, season)`:

```ts
provisional: row.gamesPlayed < PROVISIONAL_GAMES_THRESHOLD // = 10
```

(`src/modules/stats/infrastructure/UserStatsPostgresRepository.ts:10,110`).
This is computed at read time on every profile/leaderboard response — it is
not stored. `peak` is a plain running maximum tracked in `player_ratings.peak`
and exposed unconditionally alongside `rating`
(`src/modules/stats/infrastructure/UserStatsPostgresRepository.ts:88-113`); it
never decreases, including across annulment/reinstatement, because
`projectRating`'s peak tracking has no notion of "undo" — a reversal simply
adds its own (possibly negative) delta to the replay like any other row.

## How annulment compensates ratings

`AnnulledMatchRatingCompensator.compensate(matchId)`
(`src/modules/rating/application/AnnulledMatchRatingCompensator.ts`) reads
every `applied` `rating_history` row for the match, and for each one asks the
repository to insert a reversal of `-row.delta` — "undo exactly what this
match added", subject to the floor. `ReinstatedMatchRatingCompensator.reinstate(matchId)`
(`src/modules/rating/application/ReinstatedMatchRatingCompensator.ts`) does the
mirror: it finds the open reversals for the match (reversals with no matching
reinstatement yet, `FIND_OPEN_REVERSALS_QUERY` in
`RatingCompensationPostgresRepository.ts:40-53`) and inserts a reinstatement of
`-row.delta` for each. Both return `{ reversed/reinstated, skipped }` counts —
`skipped` is incremented when the insert's `ON CONFLICT DO NOTHING` finds the
row already exists (idempotent retry), not on any business rejection. See
[match-annulment.md](match-annulment.md) for how these compensators are called
per game in a batch.
