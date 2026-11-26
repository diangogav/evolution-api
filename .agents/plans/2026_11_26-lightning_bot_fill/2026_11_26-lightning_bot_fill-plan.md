---
name: "lightning_bot_fill"
description: "Fill lightning tournaments that lack players with WindBot entrants that register, pair and play like humans, instead of cancelling them"
created_at: "2026-11-26T13:07:06Z"

created_by:
  tool: "Claude Code"
  model:
    name: "Claude Opus"
    version: "5.5"
    reasoning_effort: "low"

implemented_by:
  tool: "Claude Code"
  model:
    name: "Claude Opus"
    version: "5.5"
    reasoning_effort: "low"

last_implementation_at: "2026-11-26T19:00:00Z"
has_completed_all_phases: "false"
---

# Lightning tournaments filled with bots

## Goal

When a lightning tournament reaches `starts_at` with at least 2 human entries but fewer than `min_players`, the API registers WindBot entrants of the tournament's format until `min_players` is reached, instead of cancelling it. Bots are ordinary entries: they appear in the lobby, the standings and the tables under their roster name, get paired and play; they hold their final position but nobody collects the prize of that position.

## Context

### Decisions already taken with the user

- Minimum of **2 human entries** to start; fewer still cancels (`not enough players`).
- Bots enter under their WindBot name (`Blackwing`, `Salamangreat`...), no disguise. Usernames carry a ` Bot` suffix (`Blackwing Bot`) because `users.username` is unique and short names are likely taken by real accounts.
- At most one bot per roster name per tournament (tcg 7, edison 3, jtp 2). If the roster runs out before `min_players`, the tournament starts anyway.
- Human vs bot: a real duel, the reservation's seat is `kind: "windbot"`.
- Bot vs bot: a **real duel**, not a simulated result (the user rejected the simulation of the first implementation). The reservation has two `windbot` seats; the API publishes its id on the Redis channel `duel:reservation:open`, and the duel server, subscribed, claims it itself, opens the room without any socket and requests both bots. The result reaches `reserved_duels` like any other duel.
- A bot-only reservation the server never opened (message lost, server down) is unclaimed after 3 minutes: the API revokes it and voids it for the bots (no strike), and they are paired again.
- A bot never takes a strike: `bot_unavailable` already resolves to `void` (no `abandoned_by_seat`), and a bot is never set `away`.
- Prizes: a bot keeps its position in `lightning_results` with 0 points, 0 essence and no achievements, and is never added to `lightning_rankings`. The humans below it are not moved up.
- Bot decks are the fixed WindBot `.ydk` lists; the server does not validate an internal client's deck (`EDOpro-server-ts/src/ygopro/room/domain/states/YGOProWaitingState.ts:362`). The user accepted that bots may play cards a newer ban list forbids: no deck-legality test.
- Everything sits behind `LIGHTNING_BOT_FILL_ENABLED` (off by default): off keeps today's behavior.
- Human vs bot needs no server change: the reserved-duel strategy already requests a WindBot seat by name (`EDOpro-server-ts/src/ygopro/room/application/join-strategies/ReservedDuelJoinStrategy.ts:170`), and the botlist names carry a `format` (`EDOpro-server-ts/config/botlist.example.json`). Bot vs bot needs the server phase below, deployed before `LIGHTNING_BOT_FILL_ENABLED` is turned on.
- Bot-only reservations are `single` only: WindBot never submits a side deck, so a `match` would stall in side decking (`EDOpro-server-ts/src/ygopro/matchmaking/application/MatchmakingRoomFactory.ts:59`).
- Out of scope: watching a reserved room with `w,<id>` is refused today for every reserved room, because the room password is random (`EDOpro-server-ts/src/ygopro/room/application/join-strategies/WatchJoinStrategy.ts:47`); not changed here.

### Code to consider

- Architecture and conventions: [`AGENTS.md`](../../../AGENTS.md), [`docs/architecture.md`](../../../docs/architecture.md), skill [`.agent/skills/evolution-api-modules/SKILL.md`](../../../.agent/skills/evolution-api-modules/SKILL.md).
- Designs: [`docs/design/lightning-tournaments.md`](../../../docs/design/lightning-tournaments.md), [`docs/design/lightning-swiss.md`](../../../docs/design/lightning-swiss.md).
- Module: [`src/modules/lightning/`](../../../src/modules/lightning/)
  - [`domain/nextStatusByClock.ts`](../../../src/modules/lightning/domain/nextStatusByClock.ts): `registration → running | cancelled` on `activeEntries >= minPlayers`.
  - [`application/ProcessLightningTick.ts`](../../../src/modules/lightning/application/ProcessLightningTick.ts): `advanceClock` applies the transition, starts Swiss and `startWaiting`.
  - [`domain/LightningReservation.ts`](../../../src/modules/lightning/domain/LightningReservation.ts): builds the two `user` seats.
  - [`application/PairLightningPlayers.ts`](../../../src/modules/lightning/application/PairLightningPlayers.ts), [`application/PairSwissRound.ts`](../../../src/modules/lightning/application/PairSwissRound.ts): issue one reservation per pair.
  - [`application/ApplyLightningGame.ts`](../../../src/modules/lightning/application/ApplyLightningGame.ts), [`domain/resolveLightningGame.ts`](../../../src/modules/lightning/domain/resolveLightningGame.ts): read `reserved_duels` and resolve.
  - [`application/CloseSwissRound.ts`](../../../src/modules/lightning/application/CloseSwissRound.ts): the round deadline.
  - [`application/CompleteLightningTournament.ts`](../../../src/modules/lightning/application/CompleteLightningTournament.ts): results, ranking, essence, achievements.
  - [`application/CancelLightningTournament.ts`](../../../src/modules/lightning/application/CancelLightningTournament.ts): revokes reservations of pending games.
- Reservation contract: [`src/modules/reserved-duel/domain/DuelReservation.ts`](../../../src/modules/reserved-duel/domain/DuelReservation.ts) already types a `windbot` participant.
- Push summons: [`tests/unit/modules/push/domain/lightningSummonsText.test.ts`](../../../tests/unit/modules/push/domain/lightningSummonsText.test.ts) and its source; bots must not be summoned.
- Schema: [`src/migrations/1782800000000-create-lightning-tournaments.ts`](../../../src/migrations/1782800000000-create-lightning-tournaments.ts) (`lightning_entries.user_id` has a FK to `users`). `users` columns: [`src/evolution-types/src/entities/UserProfileEntity.ts`](../../../src/evolution-types/src/entities/UserProfileEntity.ts) (`id`, unique `username`, `password`, unique `email`).
- Server roster the API roster mirrors: `EDOpro-server-ts/src/ygopro/matchmaking/domain/MatchmakingBotRoster.ts`.
- Duel server (phase 1), read `EDOpro-server-ts/CLAUDE.md`, `src/ygopro/AGENTS.md` and `docs/reserved-duels.md` first:
  - `src/shared/reserved-duel/domain/Reservation.ts:165,196`: refuses a reservation without a user seat.
  - `src/shared/reserved-duel/infrastructure/redis/RedisReservationStore.ts:16-38`: the claim script requires a user participant.
  - `src/shared/reserved-duel/domain/ReservedDuelSession.ts:84`: `botSeat()` returns the first bot's seat only.
  - `src/ygopro/room/domain/YGOProRoom.ts:648-651,683-686,711-722`: reservation gates skip when `reservedUserIds` is empty; `reservedSeatFor` seats every internal socket on `botSeat()`.
  - `src/ygopro/room/application/join-strategies/ReservedDuelJoinStrategy.ts:129-201`: room opening tied to the human's socket; `requestBot`'s `failed()` writes to that socket.
  - `src/ygopro/room/application/join-strategies/AIJoinTokenStrategy.ts:39-97`, `src/ygopro/windbot/domain/WindbotTokenStore.ts`, `src/ygopro/windbot/application/WindbotModule.ts:122-145` (failure clears every token of the room).
  - `src/ygopro/room/application/YGOProDisconnectPolicy.ts:32`: `hasNoConnectedPlayers` is true while no player is seated.
  - `src/ygopro/matchmaking/application/MatchmakingRoomFactory.ts:173-186`: the pattern for a room created without a socket.
  - `src/shared/db/redis/infrastructure/Redis.ts`, `src/bootstrap/bootstrapReservedDuels.ts`, `src/index.ts:59-104`: no pub/sub exists yet; a subscriber needs its own `duplicate()` connection.
- Client copy: `evolution-card-game/messages/es-419.json` and `messages/en.json` (`lightning_room_quorum*`), `evolution-card-game/src/features/lightning/ui/WaitingRoom.svelte`.

### Public contracts

**Database (API migration `src/migrations/1783500000000-lightning-bot-fill.ts`)**

- Seeds one `users` row per roster name: fixed uuid, username `<Name> Bot`, email `<slug>@bots.evolution.invalid`, an unusable password, no `discord_id`. Fails with a clear message when a username or email is already taken. `down` deletes exactly those ids.
- New table `lightning_bot_accounts`: `user_id` (PK, FK `users.id`), `format` (`tcg` / `edison` / `jtp`), `bot_name` (the WindBot name the server requests), `sort_order`.

**Domain**

- `LightningBotAccount = { userId: string; format: LightningFormat; botName: string }` and port `LightningBotAccountRepository.listByFormat(format, manager): Promise<LightningBotAccount[]>` (Postgres adapter in `infrastructure/`).
- `botsToFill(input: { humanEntries: number; activeEntries: number; minPlayers: number; registeredUserIds: ReadonlySet<string>; roster: LightningBotAccount[] }): LightningBotAccount[]` (pure).
- `nextStatusByClock` input gains `humanEntries: number` and `botFill: boolean`; with `botFill` the start condition is `activeEntries >= minPlayers || humanEntries >= MIN_HUMAN_ENTRIES` (`MIN_HUMAN_ENTRIES = 2`).
- `lightningDuelReservation` seats take `{ kind: "user"; userId; deck } | { kind: "windbot"; botName }`.
- `ReservationStore.announce(reservationId): Promise<void>` (reserved-duel module port, Bun Redis adapter `PUBLISH duel:reservation:open <id>`), called after `issue` for a reservation without a user seat.

**Application**

- `ProcessLightningTick.advanceClock`: on `registration → running` with bot fill on, inserts the bot entries (`newLightningEntry` with an empty deck) before `startWaiting`.
- `PairLightningPlayers.pair` / `PairSwissRound`: per pair, both humans → reservation as today; human + bot → reservation with a `windbot` seat; both bots → reservation with two `windbot` seats, then `announce`. Summons only for human seats.
- `ApplyLightningGame`: unchanged flow; a bot seat's `no_show` is recorded as `void` (no strike, stays idle).
- `CompleteLightningTournament.complete`: bot standings get `pointsAwarded = 0`, `essenceAwarded = 0`, no achievements, no `addToRanking`, no ledger entry.
- Config: `lightningWorker.botFillEnabled` from `LIGHTNING_BOT_FILL_ENABLED === "true"`.

**Duel server (`EDOpro-server-ts`)**

- Redis channel `duel:reservation:open`, payload: the reservation id. Subscribed by every instance on a dedicated connection; the atomic claim picks one.
- `parseReservation`: accepts two `windbot` seats with different `botName`s, `mode: "single"` only; one or more user seats as today.
- `ReservationStore.claimForServer(reservationId, instanceId): Promise<ClaimResult>`: a claim script that only succeeds on a reservation without a user seat.
- `OpenBotReservedDuel.run(reservationId): Promise<void>` (YGOPro application use case): claims, creates the room with a synthetic `PlayerInfoMessage` and no socket, `repository.open` with `joinedSeat: -1`, lists it, starts the lobby timeout and requests both bots; any failure finalizes the room as `bot_unavailable`.
- `ReservedDuelSession.botSeat(botName)` replaced by the seat carried in the WindBot token: `WindbotTokenPayload.seat?: number`, `WindbotModule.requestBot(..., { seat })`, `YGOProRoom.reservedSeatFor` reads the socket's reserved seat.
- `WindbotModule.requestBot` failure removes only its own token.
- `YGOProRoom.reservationAdmits` / `reservationPermitsSeat`: a reserved room with no user seat still applies its gates.
- `YGOProDisconnectPolicy`: a spectator leaving a reserved room never finalizes it.
- `ReservedDuelOpenSubscriber` (infrastructure): starts after WindBot when reserved duels and WindBot are both enabled, stops on shutdown.
- Test suites: `Reservation.test.ts` (accepts two distinct bots in single; refuses them in match; refuses the same bot twice), `RedisReservationStore.test.ts` (server claim takes a bot-only reservation once; refuses one with a user seat), `OpenBotReservedDuel.test.ts` (opens the room, records the row with no joined seat, requests both bots on their seats; finalizes as `bot_unavailable` when WindBot is off or a request fails; does nothing when claimed elsewhere), `AIJoinTokenStrategy.test.ts` / `YGOProRoomReservedDuel.test.ts` (each bot sits on its token's seat; a second bot no longer lands as a spectator; gates hold with no user seat), `WindbotModule.test.ts` (a failed request keeps the other bot's token), `YGOProDisconnectPolicy` tests (a spectator leaving an empty reserved room keeps it open), `ReservedDuelOpenSubscriber.test.ts` (runs the use case per message; ignores malformed ids).

**UI copy (client, es-419 and en)**

- `lightning_room_quorum_rule`: es-419 "Si faltan magos al empezar, el torneo se completa con bots; con menos de 2 magos, se cancela." / en "If players are missing at the start, bots fill the tournament; with fewer than 2 players, it is cancelled."
- `lightning_room_quorum_met` stays; `lightning_room_quorum` reads "{count} de {min} magos · se completará con bots" when bot fill is on (needs `botFill: boolean` in the tournament view).

**Test suites**

- `tests/unit/modules/lightning/domain/botsToFill.test.ts`: fills up to `minPlayers`; returns nothing below 2 humans; returns nothing when `minPlayers` is met; stops when the roster runs out; skips bots already registered; keeps the roster order.
- `nextStatusByClock.test.ts`: starts with 2 humans below `minPlayers` when bot fill is on; cancels with 1 human when bot fill is on; cancels below `minPlayers` when bot fill is off.
- `LightningReservation.test.ts`: builds a `windbot` seat with its bot name and no deck; keeps the user seat's registered deck.
- `PairLightningPlayers.test.ts`: issues a windbot seat for a human and a bot; issues and announces a two-windbot reservation for two bots; sends no summons to a bot.
- `ApplyLightningGame.test.ts`: voids `bot_unavailable` without a strike for anyone; a human no-show against a bot strikes the human only; an unclaimed bot-only reservation is voided for both bots without strikes.
- `ProcessLightningTick.test.ts`: registers bots at the start when bot fill is on; registers none when it is off; registers none when `minPlayers` is met.
- `CompleteLightningTournament.test.ts`: a bot in first place keeps position 1 and nobody collects its prize; the human in second gets the second prize; bots get no ranking row, essence or achievement.
- `PairSwissRound.test.ts` / `CloseSwissRound.test.ts` (phase 3): pairs a Swiss round with bots; a bot-only table closes with its round; a bot can receive the bye.
- `tests/unit/migrations/lightning-migrations.test.ts`: the bot-fill migration seeds the roster and reverts it.
- Client (phase 4): the waiting room shows the bot-fill rule when bot fill is on, and today's rule when it is off.

## Phases

### Phase 1: Bot-only reserved duels on the duel server (`EDOpro-server-ts`)

The server opens a reserved duel whose two seats are WindBots when the API announces it, and records its result like any other duel. Verifiable with a reservation written to Redis by hand plus a `PUBLISH`.

- [x] Branch `feat/bot-only-reserved-duels` from `main` in `EDOpro-server-ts`.
- [x] `parseReservation`: accept two distinct `windbot` seats in `single`; tests.
- [x] `ReservationStore.claimForServer` and its Lua script in `RedisReservationStore`; tests.
- [x] Carry the seat in the WindBot token (`WindbotTokenPayload`, `RequestWindBotJoin`, `WindbotModule.requestBot`, `AIJoinTokenStrategy`) and seat each bot on it in `YGOProRoom.reservedSeatFor`; remove `ReservedDuelSession.botSeat()`; tests.
- [x] `WindbotModule.requestBot` failure clears only its own token; test.
- [x] Keep the reservation gates and the disconnect policy closed for a reserved room with no user seat; tests.
- [x] `OpenBotReservedDuel` use case (its own room opening: the join strategy's is bound to the human's socket); tests.
- [x] `RedisReservationOpenSubscriber` on a duplicated Redis connection, started by `bootstrapBotReservedDuels` from `src/index.ts`; tests. (The server has no shutdown hook to close it on.)
- [x] Update `docs/reserved-duels.md` (seat rules, server claim, the open channel).
- [x] Verify the changes in terms of typechecking, linting and tests using the project's verification command (`pnpm lint`, `pnpm test`, `pnpm build`). Fix issues if any.
- [x] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 2: Arena tournaments filled with bots (`evolution-api`)

Bots join an arena tournament at the start, play humans and each other through real WindBot duels, and close without prizes. The current client already shows them (names come from `users`). A first version of this phase was written with simulated bot-vs-bot games and is still uncommitted on `feat/lightning-bot-fill`; this phase replaces the simulation.

- [x] Add config `lightningWorker.botFillEnabled` (`LIGHTNING_BOT_FILL_ENABLED`) and document it in `docs/operations.md` (`.env.example` lists no lightning variable, so it stays out of it).
- [x] Write migration `1783500000000-lightning-bot-fill.ts`: seed bot users, create `lightning_bot_accounts`; extend `lightning-migrations.test.ts`.
- [x] Add `LightningBotAccount`, its repository port and Postgres adapter.
- [x] Add `botsToFill` and its tests.
- [x] Extend `nextStatusByClock` with `humanEntries` and `botFill`, and its tests.
- [x] Register bot entries in `ProcessLightningTick.advanceClock` on start, with tests.
- [x] Support a `windbot` seat in `lightningDuelReservation`, with tests.
- [x] Skip prizes, ranking, essence and achievements for bots in `CompleteLightningTournament`, with tests.
- [x] Remove the simulation: `simulateBotGame`, `resolveSimulatedGame`, `LightningGame.simulatedEndsAt`, the `simulated_ends_at` column from the migration, and their tests.
- [x] Add `ReservationStore.announce` (port + Bun Redis adapter); `PairLightningPlayers` issues two-windbot reservations for bot pairs and announces them; tests.
- [x] `ApplyLightningGame`: bot seats never take a strike (including an unclaimed bot-only reservation); tests.
- [x] Update `docs/design/lightning-tournaments.md` (bot fill section) to real bot-vs-bot duels.
- [x] Verify the changes in terms of typechecking, linting and tests using the project's verification command (`bun run build`, `bun run lint`, `bun test`). Fix issues if any.
- [x] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 3: Swiss tournaments filled with bots (`evolution-api`)

The same fill for Swiss: bots count for the round number and sit at Swiss tables, bot-only tables included.

- [x] Fill Swiss tournaments too in `ProcessLightningTick` (drop the arena-only guard) and count bot entries in `startSwissTournament`.
- [x] Issue windbot seats and announced bot-only reservations in `PairSwissRound`, with tests.
- [x] Check `CloseSwissRound` closes a round whose last table is bot-only, with tests; a bot may take the bye.
- [x] A no-show that only bots caused voids the game (the table is issued again); with no human left in, the arena pairs nobody and Swiss finishes; tests.
- [x] Update `docs/design/lightning-swiss.md`.
- [x] Verify the changes in terms of typechecking, linting and tests using the project's verification command (`bun run build`, `bun run lint`, `bun test`). Fix issues if any.
- [x] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 4: Client copy for the bot fill rule (`evolution-card-game`)

The waiting room tells players the tournament fills with bots instead of saying it will be cancelled.

- [ ] API: expose `botFill: boolean` in the tournament view and its TypeBox schema (OpenAPI ratchet), with tests.
- [ ] Client: add `botFill` to `src/features/lightning/domain/dtos.ts` and pass it to `WaitingRoom.svelte` (load the `svelte-5` skill first).
- [ ] Client: update `lightning_room_quorum` and `lightning_room_quorum_rule` in `messages/es-419.json` and `messages/en.json`; add the waiting room test for both cases.
- [ ] Verify the changes in terms of typechecking, linting and tests using the project's verification commands (API: `bun run build`, `bun run lint`, `bun test`; client: `npm run lint`, `npm run typecheck`, `npm run check:svelte`, the touched tests, `npm run build`). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

## Next step

Implement Phase 4: client copy for the bot fill rule.

Arena seats filled by 🤖 next to 🐢 💨 (Turbotuga™, [Codely](https://codely.com)'s mascot), and now 🤖 ⚔️ 🤖 for real on the server 🖥️, called by the API 📣, round after round 🔁.
