# Match annulment and reversal

Annulment lets an admin void a match's competitive effects (points, wins,
losses, Elo) without deleting the match row. Reversal ("un-annul") undoes
that: it restores the effects the annulment removed. Both are batch
operations, admin-only, and off by default.

## The switch

`ANNULMENT_ENABLED` gates both directions. If it is not `"true"`,
`AnnulMatchesUseCase.run`/`UnannulMatchesUseCase.run` throw `ConflictError`
("Match annulment is disabled") before touching the database — no per-game
processing happens at all
(`src/config/index.ts:55`; `src/modules/match-annulment/application/AnnulMatchesUseCase.ts:22`;
`src/modules/match-annulment/application/UnannulMatchesUseCase.ts:25`).

## Endpoints

Both live under `/admin/matches`, guarded by `JwtAdminAuthorizer`
(`src/server/routes/admin-moderation-router.ts`):

| Route | Body | Effect |
| --- | --- | --- |
| `POST /admin/matches/annulments` | `{ gameIds, reason, offenderUserId }` | Annuls a batch of matches by `game_id`. |
| `POST /admin/matches/annulments/reversals` | `{ gameIds }` | Reverses ("un-annuls") a batch of previously annulled matches. |

Both return one outcome per game plus batch totals of reversed/reinstated and
skipped Elo rows.

## Per-game flow

Each `gameId` in the batch is processed independently and fully — one game's
failure never rolls back another's (`AnnulMatchesUseCase.processGame`,
`src/modules/match-annulment/application/AnnulMatchesUseCase.ts:40-66`). Each
game goes through two phases:

```
POST /admin/matches/annulments { gameIds, reason, offenderUserId }
        │
        ▼  per gameId
┌─────────────────────── Phase 1 (one DB transaction) ───────────────────────┐
│ lock game_id  →  check existence/flag  →  write anulled=true gate          │
│   →  find applied points_ledger rows  →  write reversal rows               │
│   →  reproject player_stats  →  adjust stats_daily_summary                 │
└──────────────────────────────────────────────────────────────────────────┘
        │  outcome: annulled | already | not-found | conflict
        ▼
┌─────────────────────── Phase 2 (Elo, separate call) ───────────────────────┐
│ AnnulledMatchRatingCompensator.compensate(gameId)                          │
│   → for each applied rating_history row: insert its reversal (floor-safe) │
└──────────────────────────────────────────────────────────────────────────┘
        │
        ▼
per-game result { outcome, pointsRows, eloReversed, eloSkipped }
```

(`MatchAnnulmentPostgresRepository.phaseOne`,
`src/modules/match-annulment/infrastructure/MatchAnnulmentPostgresRepository.ts:63-113`;
`AnnulMatchesUseCase.processGame`, as above). Reversal is the mirror: phase 1
flips the gate back to `anulled = false` and writes `reinstatement` ledger
rows for the latest open `reversal` per key; phase 2 calls
`ReinstatedMatchRatingCompensator.reinstate`.

Phase 1 runs inside one Postgres transaction, locked per game with
`pg_advisory_xact_lock` and per `(user, rank, season)` with the same ladder
lock rating compensation uses, so a concurrent annulment/reinstatement on an
overlapping key serializes rather than races
(`GAME_LOCK_QUERY`/`LADDER_LOCK_QUERY`,
`MatchAnnulmentPostgresRepository.ts:13,101`). Phase 2 (Elo) is a separate,
unlocked call made only after phase 1 commits — see "Idempotency" below for
why that ordering is safe.

## Per-game outcomes

| Outcome (annul) | Meaning |
| --- | --- |
| `annulled` | The match was flagged and its points/Elo reversed. |
| `already` | The match was already annulled and already had a reversal ledger row; nothing changed. |
| `not-found` | No non-deleted match rows exist for that `game_id`. |
| `conflict` | Phase 1 rejected the write — see below. |
| `partial` | Phase 1 committed but phase 2 (Elo) threw; ledger/`player_stats` are consistent, Elo compensation for this game did not complete. |

Reversal's outcomes mirror this: `un-annulled`, `not-annulled` (nothing to
reverse), `not-found`, `conflict`, `partial`
(`src/modules/match-annulment/domain/AnnulmentOutcome.ts`).

A `conflict` carries a `reason`:

- `summary-key-mismatch` — the match's rows disagree on `(day, ban_list_name,
  season)`, so the daily summary cannot be adjusted safely.
- `reconciliation-drift:<userId>:<rankId>:<season>` — after writing the
  correction rows, replaying the ledger for that key does not match the
  `player_stats` row already on disk; the whole phase-1 transaction is rolled
  back (`checkReconciliation`,
  `MatchAnnulmentPostgresRepository.ts:200-229`). This is a safety check, not
  an expected outcome.
- Any other infrastructure error message, if phase 1 throws outside the two
  cases above (`AnnulMatchesUseCase.runPhaseOne`/
  `UnannulMatchesUseCase.runPhaseOne` catch and report it as `conflict` rather
  than aborting the batch).

## What gets touched

| Store | Annul | Un-annul |
| --- | --- | --- |
| `matches.anulled`, `anulled_user_id`, `anulled_reason`, `anulled_by` | Set (first write wins — later annulments never overwrite an existing reason/offender: `COALESCE` in `ANNUL_GATE_QUERY`) | Cleared |
| `points_ledger` | New `reversal` rows | New `reinstatement` rows |
| `player_stats` | Recomputed from the ledger | Recomputed from the ledger |
| `rating_history` / `player_ratings` | New `reversal` rows; rating/peak/games recomputed | New `reinstatement` rows; rating/peak/games recomputed |
| `stats_daily_summary` | `total_duels` decremented for the match's day/ban list/season | Incremented back, but only if the match had actually been reversed before |

## Idempotency

Every layer is safe to retry:

- Phase 1 checks `bool_or(anulled)` and whether a `reversal` row already
  exists before writing anything; annulling an already-annulled-and-reversed
  match returns `already` without writing new rows
  (`MatchAnnulmentPostgresRepository.ts:70-85`).
- Ledger inserts use `INSERT ... ON CONFLICT DO NOTHING` against the
  `(game_id, user_id, rank_id, kind, cycle)` unique index, so a retried insert
  is a no-op (`INSERT_ENTRY_QUERY`,
  `src/modules/points-ledger/infrastructure/PointsLedgerPostgresRepository.ts:21-23`).
- Rating history inserts have the same `ON CONFLICT DO NOTHING` shape against
  `(match_id, user_id, rank_id, kind, cycle)`
  (`RatingCompensationPostgresRepository.ts:21-35`); a repeated phase-2 call
  after a `partial` outcome only inserts the rows still missing and reports
  them as `skipped` for the rest.

This is why phase 2 can safely run again after a `partial` result: re-running
the whole batch (or just the failed game) re-derives the same ledger/rating
state instead of double-applying it.
