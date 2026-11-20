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
- **S8** Bots are Goat format (client doc S8). User: "decks del evento". The player picks one of the decks the calendar supplies; the reservation locks it exactly.

Assumptions (not user requirements): results are applied when the player reads the calendar or requests a duel, with no background worker; one ledger kind `advent_calendar` with distinct reference keys for door, die and recovery; the calendar window may outlast day 24 so missed days can still be recovered.

## Tasks

- [x] T1 (S1, S2, S5, S7) Domain rules: calendar day, door status, duel effect on a door, rune die. Route: inline. RED: the three test files failed on a missing module, then 31 tests green (module boundaries ratchet included).
- [x] T2 (S3, S4, S5, S6) Migrations: catalog, door progress, reservations, applied-duel gate, ledger kind `advent_calendar`. Route: inline. Commit 59c88a4. High risk item 1. RED: the migration test failed on missing modules, then green. Only new tables and one new enum value; never run from here.
- [x] T3 (S3, S4, S8) Request a door duel and apply its result. Route: inline. Commit 68ff250. RED: the four use case test files failed on missing modules. The player picks one of the calendar's decks per duel, locked exactly.
- [x] T4 (S5, S6) Roll the die, recover a door. Route: inline. Commit 68ff250.
- [x] T5 (S1) Calendar view, Postgres repositories, router `/advent-calendars`, OpenAPI ratchet, docs. Route: inline. RED: the router test failed on a missing module. Full suite 1934 pass, lint clean, type check clean.
- [ ] T6 Seed the December 2026 calendar. Blocked on the 24 bots, the event decks and the prize table.
- [x] T7 (S4) Prize cosmetics in the calendar view: a top-level `cosmetics` list with type, name and signed asset URLs, each cosmetic once, built after the transaction. Route: inline. RED: three new view tests failed, then green. Full suite 1938 pass, lint and type check clean.
- [x] T8 Client: the advent page runs on these endpoints (client doc T4, `evolution-card-game` branch `feat/advent-event`). The calendar view gained `balance` for it (commit 5ae09ac). Not run end to end.

## Log

- L1 (2026-11-19, user, after the proposal to build the calendar model in the API): "si"
- L2 Evidence (explorer map of `src/modules/event-run`): event tables are API-owned raw-SQL migrations, no `evolution-types` change; the duel server writes `reserved_duels` and the API reads it, with no callback; essence is idempotent on (user, kind, reference key); cosmetics are granted by `GrantCosmeticToUser.runForUserId`; the run model (a loss ends the run) does not fit.
- L3 (2026-11-19, user): "vamos a dar premios cosmeticos en algunas puertas, y una consulta, que criterio podemos usar para un leaderboard de esto?"
- L4 (2026-11-19, user): "vale la pena el leaderboard?" Recommendation given: not in the first edition (bot duels tie constant players, late joiners cannot compete, extra cost); store attempts so it can be added later.
- L5 (2026-11-19, user): "si, medianoche UTC y sin leaderboard"
- L6 Decision: a separate module `advent-calendar`; it imports `PickIndex`, `randomPickIndex`, `resolveDuelRecord` and `DuelResolution` through the `event-run` index, which now exports them.
- L7 Open: Halloween locks the player to a deck the event supplies (`deckLock: "exact"`). Whether the advent duel uses the player's own Goat deck or supplied decks is the user's call; it shapes the catalog and the duel request.
- L8 (2026-11-19, user, on own deck versus supplied decks): "decks del evento"
- L9 Decision: results are applied under the door's row lock by every use case that touches a door (read, duel request, roll, recovery); no worker. A win nobody reads stays pending until the player's next request, including after the calendar closes, since the read applies it regardless of the window.
- L10 Decision: a roll and an unread win stay claimable after the calendar closes; requesting a duel and recovering a door require the calendar to be open.
- L11 Evidence: a path `day` declared as `t.Integer({ minimum: 1 })` reaches the handler as a number and answers 422 for `0`, `abc` and `2.5` (probed with a throwaway Elysia app).
- L12 Not verified: nothing ran against a real Postgres or a real duel server. Repository tests check the SQL text and parameters, as the rest of the repo does.
- L13 (2026-11-19) Independent verifier over `origin/main...a894df2`: no blockers; migrations, locks, once-only payments and concurrent pairs checked. Fixed from its findings: recovery answered 200 and charged while the door's duel was still live (RED: the new test failed, then green). Left as they are: a reservation issued before 00:00 UTC stays playable for its 10-minute lifetime, so a door can be won minutes after its day ended; a retired prize cosmetic is skipped silently, as in `event-run`; a duel record open for over 2 hours is voided and a later win on it is never applied (inherited from `event-run`).
- L14 Open for the user: door 24 never becomes `missed`, because the calendar day stops at 24; with a window that outlasts day 24 it stays free to play until the calendar closes while doors 1-23 need recovery.
- L15 For T6: the seed must validate the catalog (doors numbered 1..24, five die essence values, `starts_at` at 00:00 UTC); a short `die.essence` makes a roll fail and roll back, which would let the player roll again. Whether entitlements reject a duplicate grant under concurrency was not checked.
- L16 (2026-11-19, user, on the recommendation that door 24 becomes missed on day 25 and is recovered with essence like the others): "vamos con lo recomendado". The calendar day no longer stops at the last door (RED: three new tests failed first). L14 closed.
