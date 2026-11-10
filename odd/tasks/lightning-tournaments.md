# Lightning tournaments

Objective: chess.com-style quick tournaments (register, get paired, duel, standings) built inside evolution-api as an arena on top of the shipped reserved-duel capability; the duel server stays duel-only.
Repos and branches: EDOpro-server-ts `feat/reservation-clock` (T1 committed); evolution-types `feat/drop-lightning-tables`; evolution-api `feat/lightning-tournaments` (chained PRs from `main`); evolution-card-game `feat/lightning-tournaments`; evolution-backoffice (create/cancel screens, later). Delivery: chained PRs per repo (≤700 changed lines each). Test runners: `bun test` (api), `npm test` / jest (server), vitest touched files + build (client).
Design: `docs/design/lightning-tournaments.md` (written 2026-11-09; not yet reviewed).

## Specs

- S1 Shape. User, verbatim: "chess.com tiene un sistema de torneos rapidos donde los usuarios se registran, se hace el sorteo y se juegan laas partidas". Decided: arena format (fixed window, continuous pairing of idle players by score, single duels with a per-player clock); win 3 / draw 1 / loss 0; tiebreak score, wins, Buchholz, registration time. Swiss stays a future pairing policy behind the same port.
- S2 Not the old service. User, verbatim: "tenia este proyecto https://github.com/diangogav/evolution-tournaments q se consumia desde api pero no se llego a usar en prod y se removio, no se si es over enginnering". Assessed as over-engineered (generic multi-discipline engine, own DB and identity, no duel-server integration). Decided: module `src/modules/lightning` inside the API; nothing restored from the old repo beyond the state-machine and seeding ideas.
- S3 Server boundary (inherited from halloween-event-runs S3): the server knows only reserved duels. The only server change is an optional `turnTimeSeconds` reservation option (60–998) emitting the existing `tm` token. Verified 2026-11-09: the limit is per turn (the core resets it every new turn), not a per-duel clock.
- S4 Server-authoritative results: every game is a reservation; the API reads `reserved_duels` only for reservation ids it issued (`lightning_games`), applies each once.
- S5 Live updates by polling. User asked "conviene polling o websocket?" and accepted polling ("dale"): the client polls `GET /lightning/{id}/me` every 3 s while on the tournament page, behind a `LightningFeed` port so SSE can replace it later.
- S6 Tables: the three empty `lightning_*` tables in evolution-types are dropped (after exporting and confirming they are empty in every environment) and recreated as API-owned tables, plus `lightning_entries` and `lightning_games`.
- S7 Prizes: season points into `lightning_rankings` and essence via `essence_ledger` kind `lightning_tournament`, both configured per tournament at creation; trophies stay manual.

## Tasks

| ID | Repo | Task | S# | Route | Risk | Status | Commit |
|---|---|---|---|---|---|---|---|
| T1 | server | `turnTimeSeconds` (60–998, optional) in `Reservation` parsing and `reservedRoomCommand` → `tm` token; tests; docs | S3 | inline | 3 shared contract (additive) | done (`feat/reservation-clock`, 300 suites green; PR pending) | 3923f69b |
| T2 | evolution-types | Migration dropping `lightning_tournaments`, `lightning_results`, `lightning_rankings`; remove the entities from `data-source.ts`; bump the submodule in api and server | S6 | inline | 1 persisted schema (drop; export first) | migration committed on `feat/drop-lightning-tables` (`lightning_results` never had a table); before running it in any environment, export and confirm the two tables are empty; submodule bump pending merge | b1f881d |
| T3 | api | Migrations (cosmetics DataSource): `lightning_tournaments`, `lightning_entries`, `lightning_games`, `lightning_results`, `lightning_rankings`; `ALTER TYPE essence_ledger_kind_enum ADD VALUE 'lightning_tournament'` in its own migration + `ESSENCE_LEDGER_KINDS` | S6, S7 | delegated | 1 | done (`feat/lightning-tournaments`; not run in any environment; after T2) | 97aebec |
| T4 | api | Domain: tournament state machine, entry presence, `pairIdlePlayers` (pure), `resolveLightningGame` (pure, from `ReservedDuelRecord`), standings + tiebreak (pure), reservation factory for two users; unit tests | S1, S4 | delegated | none | done (reserved-duel extracted from event-run first: dc35ed3, c453828) | 764a33f |
| T5 | api | Use cases: `CreateLightningTournament`, `CancelLightningTournament`, `EnterLightningTournament` (deck validation via community-decks), `WithdrawEntry`, `PauseEntry` / `ResumeEntry`, `GetMyLightningState` (applies pending first), `GetLightningTournament`, `ListLightningTournaments`, `GetLightningRankings`, `ApplyLightningGame`, `PairLightningPlayers`, `CompleteLightningTournament`, `ProcessLightningTick` | S1, S4, S7 | delegated | 4 concurrency (tournament row lock) | done | a28a93c, ac4fa46, eb99e56 |
| T6 | api | Repositories, unit of work with advisory lock, `LightningWorker` + `buildLightningWorker`, config flags, started from `index.ts`, `server.ts`, `worker.ts` | S4 | delegated | 4 | done (JTP list added to community-decks for entry checks) | 9c271f5, d4591c0, 538d1f2 |
| T7 | api | Router + TypeBox schemas, admin routes via `adminAuthorizer`, OpenAPI ratchet, docs index | S1 | delegated | none | done | 4fe72f5, 8f6e9ef |
| T8 | client | `duelOverlayStore.startReservedDuel(password, deck)` generalising the event seam | S1 | delegated | 6 (shared overlay) | pending | |
| T9 | client | `lightning` feature: API client, `LightningFeed` polling port, store, list + detail + waiting room + result inline, nav entry, home card, i18n en/es-419 | S1, S5 | delegated | none | pending | |
| T10 | all | Local end-to-end with two accounts (register → paired → duel → applied → completed), deploy order: server → evolution-types migration → API migrations → API → client | S1-S7 | inline | 5 | pending | |

## Log

- L1 (2026-11-09, user): opened the topic with the chess.com comparison; asked whether the old evolution-tournaments service was over-engineering. Assessment: yes (scope and cut, not the architecture). Direction: module in the API on reserved duels.
- L2 (2026-11-09): explored api, server and client; reserved duels confirmed shipped (server PRs #443-#448, event-run module in the API). Design doc written. Arena chosen over Swiss and brackets. Polling chosen over WebSocket/SSE (multi-instance API, no push channel, latency irrelevant next to the room join).
- L3 (2026-11-09): T3–T7 implemented on `feat/lightning-tournaments` with TDD, one commit per reviewable unit. Contract additions over the design: a reservation with no `reserved_duels` row 3 minutes after issue is revoked and resolved `no_show` for both seats (`unclaimed`); `GET /lightning/{id}/me` also returns the tournament, the active player count, the room id once open and the last resolved game. Tags are `Lightning` and `Lightning Admin` (the ratchet retires `Lightning Tournaments`). Migrations not run; they assume T2 dropped the legacy tables.
