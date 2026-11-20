# Advent calendar (API)

Objective: the server side of the December advent event: 24 daily doors, each a boss duel against a Goat-format bot, a fixed door prize, a server-rolled bonus die and paid recovery of missed days. The client side is `evolution-card-game` branch `feat/advent-event` (`odd/tasks/advent-event.md` there).
Branch `feat/advent-calendar` (worktree `../.wt-api-advent`), released in December. Delivery strategy: `ask-on-risk`. Test runner: `bun test <path>`, then `bun test` and `bun run lint`.

## Specs

- **S1** Calendar rules. 24 doors, one per day of December. A door is `locked` (its day has not come), `open` (today, or a recovered day), `missed` (a past day never cleared) or `cleared`. Losing a duel never ends anything.
- **S2** Day boundary. User: "si, medianoche UTC y sin leaderboard". Doors change at 00:00 UTC, like the daily missions.
- **S3** Door duel. The API reserves the duel against the door's bot; the duel server writes the result and the API reads it. The client never decides who won. A result is applied at most once.
- **S4** Door prize. Winning grants the door's fixed prize once. User: "vamos a dar premios cosmeticos en algunas puertas". A prize is essence, cosmetics, or both.
- **S5** Rune die. After a door is cleared the server rolls 1-6 once and stores it: 1-5 pay extra essence, 6 pays a rare prize. Asking again returns the same roll.
- **S6** Recovery. A missed door is reopened by paying essence, under the user's ledger lock, at most once per door.
- **S7** No leaderboard in this edition. User: "si, medianoche UTC y sin leaderboard". Attempts per door are still stored (a duel the player leaves before it starts counts), so a merit prize or a later leaderboard needs no data change.
- **S8** Bots are Goat format (client doc S8). Which deck the player brings is not decided yet.

Assumptions (not user requirements): results are applied when the player reads the calendar or requests a duel, with no background worker; one ledger kind `advent_calendar` with distinct reference keys for door, die and recovery; the calendar window may outlast day 24 so missed days can still be recovered.

## Tasks

- [x] T1 (S1, S2, S5, S7) Domain rules: calendar day, door status, duel effect on a door, rune die. Route: inline. RED: the three test files failed on a missing module, then 31 tests green (module boundaries ratchet included).
- [ ] T2 (S3, S4, S5, S6) Migrations: catalog, door progress, reservations, applied-duel gate, ledger kind. Route: inline. High risk item 1. Written and tested only, never run from here.
- [ ] T3 (S3, S4) Request a door duel and apply its result. Route: inline. Blocked on the player deck decision (S8).
- [ ] T4 (S5, S6) Roll the die, recover a door. Route: inline.
- [ ] T5 (S1) Calendar view endpoint and router, OpenAPI ratchet. Route: inline.
- [ ] T6 Seed the December 2026 calendar. Blocked on the 24 bots, their decks and the prize table.

## Log

- L1 (2026-11-19, user, after the proposal to build the calendar model in the API): "si"
- L2 Evidence (explorer map of `src/modules/event-run`): event tables are API-owned raw-SQL migrations, no `evolution-types` change; the duel server writes `reserved_duels` and the API reads it, with no callback; essence is idempotent on (user, kind, reference key); cosmetics are granted by `GrantCosmeticToUser.runForUserId`; the run model (a loss ends the run) does not fit.
- L3 (2026-11-19, user): "vamos a dar premios cosmeticos en algunas puertas, y una consulta, que criterio podemos usar para un leaderboard de esto?"
- L4 (2026-11-19, user): "vale la pena el leaderboard?" Recommendation given: not in the first edition (bot duels tie constant players, late joiners cannot compete, extra cost); store attempts so it can be added later.
- L5 (2026-11-19, user): "si, medianoche UTC y sin leaderboard"
- L6 Decision: a separate module `advent-calendar`; it imports `PickIndex`, `randomPickIndex`, `resolveDuelRecord` and `DuelResolution` through the `event-run` index, which now exports them.
- L7 Open: Halloween locks the player to a deck the event supplies (`deckLock: "exact"`). Whether the advent duel uses the player's own Goat deck or supplied decks is the user's call; it shapes the catalog and the duel request.
