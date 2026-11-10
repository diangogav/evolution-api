# Lightning tournaments — Swiss system

Objective: a second pairing system for lightning tournaments, Swiss rounds next to the arena, reusing entries, reserved duels, applying records, standings, the worker, the close and the season ranking.
Repos and branches: evolution-api `feat/lightning-swiss` (stacked on `feat/lightning-tournaments`, PR #166); evolution-card-game (client, in parallel against the HTTP contract below). The duel server needs nothing. Test runner: `bun test` (api).
Design: `docs/design/lightning-swiss.md`.

## Specs

- S1 System per tournament: `arena` (default, unchanged) or `swiss`, chosen at creation.
- S2 Rounds: given at creation (2–9) or null → `max(3, ceil(log2(activePlayersAtStart)))`, written at the start and fixed. No late registration for Swiss.
- S3 Round barrier: the next round is paired only when every game of the round is resolved and `round_break_seconds` (default 60) passed since it closed. Round deadline `round_started_at + round_minutes` (default 40): unfinished games close as draws, reservations revoked, later records ignored.
- S4 Pairing: round one by a seeded shuffle (tournament id + round); later rounds by score groups with float-down and no rematch in the whole tournament (bounded backtrack); rematch with the smallest score gap only when none can be avoided. Odd field: bye to the lowest-placed player without one (3 points, no Buchholz, `lightning_byes`).
- S5 Resolutions: single no-show = loss for the absent seat and win for the present one; double no-show = double loss; second no-show drops the player; infrastructure void re-issues the same pair in the same round; abandon after start = loss for the leaver. No pause (422); withdraw = drop.
- S6 Standings: score, Buchholz, wins, registration (arena unchanged). Field down to one player → remaining rounds skipped, completed. `ends_at` is an estimate; the clock never ends a Swiss tournament, its last round does.
- S7 HTTP contract: `POST /lightning` takes `system`, `rounds`, `roundMinutes`, `roundBreakSeconds`; `TournamentView` gains `system`, `rounds`, `currentRound`, `roundEndsAt`, `nextRoundAt`; `GET /lightning/{id}` gains `round`; `GET /lightning/{id}/me` gains `bye`.

## Tasks

| ID | Repo | Task | S# | Route | Risk | Status | Commit |
|---|---|---|---|---|---|---|---|
| T1 | api | Migration `AddLightningSwiss1782900000000` (tournament system and round columns with CHECKs, `lightning_games.round`, `lightning_byes`); `system`/rounds settings on the tournament factory; round count, estimated end, round clocks; tournament repository columns | S1, S2, S6 | delegated | 1 persisted schema (additive) | done (not run in any environment) | 4221149 |
| T2 | api | `pairSwissRound` (pure): seeded round one, score groups, float-down, bounded backtrack, fewest/closest rematches, bye | S4 | delegated | none | done | 11e2e8c |
| T3 | api | Swiss game effects (`recordSwissGameOutcome`, `recordBye`, present seat wins a no-show), Swiss tiebreak in `computeStandings`, clock never ends Swiss | S5, S6 | delegated | none | done | 56b97e7 |
| T4 | api | Game round and bye repositories (`listByRound`, `LightningByePostgresRepository`) | S3, S4 | delegated | none | done | d3fed49 |
| T5 | api | `CloseSwissRound` (deadline draws, barrier, last round / field of one → finishing), `PairSwissRound` (next round after the break, re-issue voided tables), Swiss path in `ApplyLightningGame` and `ProcessLightningTick` (start fixes rounds and end), Swiss completion order; worker wiring | S2–S6 | delegated | 4 concurrency (tournament row lock, savepoints) | done | f226f58, f33b9b3 |
| T6 | api | Swiss entries close at the start; pause answers 422; withdraw drops without `away` | S2, S5 | delegated | none | done | 5764780 |
| T7 | api | Views: tournament round fields, `round` in the detail (tables, results, watch room, bye, `noShowSeats`), `bye` and no `away` in `/me` | S7 | delegated | none | done | 5fd11ed |
| T8 | api | TypeBox schemas, create body, OpenAPI examples and descriptions | S7 | delegated | 3 shared contract (additive) | done | 188bf64 |
| T9 | api | Design deviations, docs index, operations note | S1–S7 | delegated | none | done | 28f7a9c |
| T10 | all | Run the migration in dev, local end-to-end of a Swiss tournament with the client | S1–S7 | inline | 5 | pending | |

## Log

- L1 (2026-11-10): T1–T9 implemented on `feat/lightning-swiss` with TDD, one commit per reviewable unit. Choices over the design, all recorded in the design doc: second no-show sets `removed` (as the arena's third strike), a voluntary drop is `withdrawn`; every scored result, the bye and a no-show loss included, counts as a game played; the bye moves up when the lowest player's bye would force a rematch; an unclaimed reservation stays a double no-show; the stale rule does not apply to Swiss games; a fully voided table at the deadline gets a draw game row; `endsAt` stays required in the create body and is ignored for Swiss; `noShowSeats` is optional on `no_show` tables.
