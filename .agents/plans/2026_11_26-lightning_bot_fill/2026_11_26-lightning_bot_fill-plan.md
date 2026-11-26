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
- Bot vs bot: the server refuses a reservation without a user seat (`EDOpro-server-ts/src/shared/reserved-duel/domain/Reservation.ts:196`), so the API simulates it: the table shows as playing for a random 4 to 12 minutes and resolves to a random winner, seeded by the reservation id so a retried tick gives the same result.
- A bot never takes a strike: `bot_unavailable` already resolves to `void` (no `abandoned_by_seat`), and a bot is never set `away`.
- Prizes: a bot keeps its position in `lightning_results` with 0 points, 0 essence and no achievements, and is never added to `lightning_rankings`. The humans below it are not moved up.
- Bot decks are the fixed WindBot `.ydk` lists; the server does not validate an internal client's deck (`EDOpro-server-ts/src/ygopro/room/domain/states/YGOProWaitingState.ts:362`). The user accepted that bots may play cards a newer ban list forbids: no deck-legality test.
- Everything sits behind `LIGHTNING_BOT_FILL_ENABLED` (off by default): off keeps today's behavior.
- No duel server change: the reserved-duel strategy already requests a WindBot seat by name (`EDOpro-server-ts/src/ygopro/room/application/join-strategies/ReservedDuelJoinStrategy.ts:170`), and the botlist names carry a `format` (`EDOpro-server-ts/config/botlist.example.json`).

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
- Client copy: `evolution-card-game/messages/es-419.json` and `messages/en.json` (`lightning_room_quorum*`), `evolution-card-game/src/features/lightning/ui/WaitingRoom.svelte`.

### Public contracts

**Database (API migration `src/migrations/1783500000000-lightning-bot-fill.ts`)**

- Seeds one `users` row per roster name: fixed uuid, username `<Name> Bot`, email `<slug>@bots.evolution.invalid`, an unusable password, no `discord_id`. Fails with a clear message when a username or email is already taken. `down` deletes exactly those ids.
- New table `lightning_bot_accounts`: `user_id` (PK, FK `users.id`), `format` (`tcg` / `edison` / `jtp`), `bot_name` (the WindBot name the server requests), `sort_order`.
- `lightning_games`: new column `simulated_ends_at timestamptz NULL`; a simulated game has no reservation behind it.

**Domain**

- `LightningBotAccount = { userId: string; format: LightningFormat; botName: string }` and port `LightningBotAccountRepository.listByFormat(format, manager): Promise<LightningBotAccount[]>` (Postgres adapter in `infrastructure/`).
- `botsToFill(input: { humanEntries: number; activeEntries: number; minPlayers: number; registeredUserIds: ReadonlySet<string>; roster: LightningBotAccount[] }): LightningBotAccount[]` (pure).
- `nextStatusByClock` input gains `humanEntries: number` and `botFill: boolean`; with `botFill` the start condition is `activeEntries >= minPlayers || humanEntries >= MIN_HUMAN_ENTRIES` (`MIN_HUMAN_ENTRIES = 2`).
- `lightningDuelReservation` seats take `{ kind: "user"; userId; deck } | { kind: "windbot"; botName }`.
- `simulateBotGame(reservationId: string, issuedAt: Date): { endsAt: Date; winnerSeat: 0 | 1 }` (pure, seeded; 4 to 12 minutes).
- `resolveSimulatedGame(game, now): GameResolution | null`.
- `LightningGame.simulatedEndsAt: Date | null`.

**Application**

- `ProcessLightningTick.advanceClock`: on `registration → running` with bot fill on, inserts the bot entries (`newLightningEntry` with an empty deck) before `startWaiting`.
- `PairLightningPlayers.pair` / `PairSwissRound`: per pair, both humans → reservation as today; human + bot → reservation with a `windbot` seat; both bots → game row with `simulated_ends_at`, no reservation. Summons only for human seats.
- `ApplyLightningGame`: a game with `simulated_ends_at` resolves when `now >= simulated_ends_at`, without reading `reserved_duels`.
- `CompleteLightningTournament.complete`: bot standings get `pointsAwarded = 0`, `essenceAwarded = 0`, no achievements, no `addToRanking`, no ledger entry.
- `CancelLightningTournament.run`: does not revoke simulated games.
- Config: `lightningWorker.botFillEnabled` from `LIGHTNING_BOT_FILL_ENABLED === "true"`.

**UI copy (client, es-419 and en)**

- `lightning_room_quorum_rule`: es-419 "Si faltan magos al empezar, el torneo se completa con bots; con menos de 2 magos, se cancela." / en "If players are missing at the start, bots fill the tournament; with fewer than 2 players, it is cancelled."
- `lightning_room_quorum_met` stays; `lightning_room_quorum` reads "{count} de {min} magos · se completará con bots" when bot fill is on (needs `botFill: boolean` in the tournament view).

**Test suites**

- `tests/unit/modules/lightning/domain/botsToFill.test.ts`: fills up to `minPlayers`; returns nothing below 2 humans; returns nothing when `minPlayers` is met; stops when the roster runs out; skips bots already registered; keeps the roster order.
- `nextStatusByClock.test.ts`: starts with 2 humans below `minPlayers` when bot fill is on; cancels with 1 human when bot fill is on; cancels below `minPlayers` when bot fill is off.
- `LightningReservation.test.ts`: builds a `windbot` seat with its bot name and no deck; keeps the user seat's registered deck.
- `simulateBotGame.test.ts`: lasts between 4 and 12 minutes; gives the same result for the same reservation id; picks both seats across ids.
- `resolveLightningGame.test.ts`: a simulated game is live before its end; resolves to its seeded winner after it.
- `PairLightningPlayers.test.ts`: issues a windbot seat for a human and a bot; writes a simulated game without a reservation for two bots; sends no summons to a bot.
- `ApplyLightningGame.test.ts`: applies a simulated game at its end time; voids `bot_unavailable` without a strike for anyone; a human no-show against a bot strikes the human only.
- `ProcessLightningTick.test.ts`: registers bots at the start when bot fill is on; registers none when it is off; registers none when `minPlayers` is met.
- `CompleteLightningTournament.test.ts`: a bot in first place keeps position 1 and nobody collects its prize; the human in second gets the second prize; bots get no ranking row, essence or achievement.
- `CancelLightningTournament.test.ts`: cancels a tournament with a simulated game without revoking it.
- `PairSwissRound.test.ts` / `CloseSwissRound.test.ts` (phase 2): pairs a Swiss round with bots; a simulated table ends before the round deadline; a bot can receive the bye.
- `tests/unit/migrations/lightning-migrations.test.ts`: the bot-fill migration seeds the roster and reverts it.
- Client (phase 3): the waiting room shows the bot-fill rule when bot fill is on, and today's rule when it is off.

## Phases

### Phase 1: Arena tournaments filled with bots

Bots join an arena tournament at the start, play humans through real WindBot duels, play each other through simulated games, and close without prizes. The current client already shows them (names come from `users`).

- [ ] Add config `lightningWorker.botFillEnabled` (`LIGHTNING_BOT_FILL_ENABLED`) and document it in `.env.example` and `docs/operations.md`.
- [ ] Write migration `1783500000000-lightning-bot-fill.ts`: seed bot users, create `lightning_bot_accounts`, add `lightning_games.simulated_ends_at`; extend `lightning-migrations.test.ts`.
- [ ] Add `LightningBotAccount`, its repository port and Postgres adapter.
- [ ] Add `botsToFill` and its tests.
- [ ] Extend `nextStatusByClock` with `humanEntries` and `botFill`, and its tests.
- [ ] Register bot entries in `ProcessLightningTick.advanceClock` on start, with tests.
- [ ] Support a `windbot` seat in `lightningDuelReservation`, with tests.
- [ ] Add `simulateBotGame` and the simulated branch of the resolution, with tests.
- [ ] Update `PairLightningPlayers` (three pair kinds, summons only to humans) and `LightningGame`/its Postgres repository for `simulatedEndsAt`, with tests.
- [ ] Apply simulated games in `ApplyLightningGame`; check `bot_unavailable` and human no-show against a bot, with tests.
- [ ] Skip prizes, ranking, essence and achievements for bots in `CompleteLightningTournament`, with tests.
- [ ] Skip revoking simulated games in `CancelLightningTournament`, with a test.
- [ ] Update `docs/design/lightning-tournaments.md` (states, pairing, applying, closing) with the bot fill rules.
- [ ] Verify the changes in terms of typechecking, linting and tests using the project's verification command (`bun run build`, `bun run lint`, `bun test`). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 2: Swiss tournaments filled with bots

The same fill for Swiss: bots count for the round number, sit at Swiss tables, and simulated tables end inside the round.

- [ ] Count bot entries in `startSwissTournament`'s player count at the start.
- [ ] Issue windbot seats and simulated games in `PairSwissRound`, clamping `simulated_ends_at` before the round deadline, with tests.
- [ ] Check `CloseSwissRound` closes a round whose last table is simulated, with tests; a bot may take the bye.
- [ ] Update `docs/design/lightning-swiss.md`.
- [ ] Verify the changes in terms of typechecking, linting and tests using the project's verification command (`bun run build`, `bun run lint`, `bun test`). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 3: Client copy for the bot fill rule (`evolution-card-game`)

The waiting room tells players the tournament fills with bots instead of saying it will be cancelled.

- [ ] API: expose `botFill: boolean` in the tournament view and its TypeBox schema (OpenAPI ratchet), with tests.
- [ ] Client: add `botFill` to `src/features/lightning/domain/dtos.ts` and pass it to `WaitingRoom.svelte` (load the `svelte-5` skill first).
- [ ] Client: update `lightning_room_quorum` and `lightning_room_quorum_rule` in `messages/es-419.json` and `messages/en.json`; add the waiting room test for both cases.
- [ ] Verify the changes in terms of typechecking, linting and tests using the project's verification commands (API: `bun run build`, `bun run lint`, `bun test`; client: `npm run lint`, `npm run typecheck`, `npm run check:svelte`, the touched tests, `npm run build`). Fix issues if any.
- [ ] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

## Next step

Implement Phase 1: arena tournaments filled with bots.

Plan powered by 🐢 💨 (Turbotuga™, [Codely](https://codely.com)'s mascot), ready to fill every empty seat.
