# Lightning tournaments — Swiss system

A second pairing system for lightning tournaments, next to the arena (`docs/design/lightning-tournaments.md`). Every player plays every round, nobody is eliminated, and pairings follow the standings round by round. It reuses the whole lightning module: entries, reserved duels, applying records, standings, the worker, the close and the season ranking. What is new is the round barrier, the bye, the no-rematch rule across the whole tournament and a round deadline.

The duel server needs nothing: a Swiss game is the same reservation an arena game is.

## Why Swiss for the second system

| | Arena | Swiss | Single elimination |
|---|---|---|---|
| Who plays | whoever is free, until the clock ends | everyone, every round | half the field leaves each round |
| Duration | fixed window | rounds × slowest duel | rounds × slowest duel |
| One bad hand | costs a game | costs a game | ends the tournament |
| Odd field, drops, no-shows | nothing to fix | a bye; a drop leaves the field | a bye; a drop breaks a branch |
| Already built | yes | pairing by score and Buchholz | nothing |

Official Yu-Gi-Oh! events run Swiss followed by a top cut. A top cut by brackets is a later phase, worth it only once Swiss fields reach 16 players.

## Quick path

```
Admin   POST /lightning {system: "swiss", rounds?}    → API    scheduled tournament; rounds null = computed at start
Player  POST /lightning/{id}/entries {deck}          → API    registration until starts_at only (no late entry)
Worker  tick at starts_at                            → API    < minPlayers → cancelled; else running, rounds fixed, round 1 paired
Worker  every tick while a round is live             → API    apply finished games (same ApplyLightningGame)
Worker  every game of the round resolved             → API    round closed; break of round_break_seconds
Worker  break over                                   → API    next round paired from the standings; bye if odd
Worker  deadline of a round reached                  → API    unresolved games closed as draws, reservations revoked
Worker  last round closed                            → API    completed: standings, results, season points, essence
```

## Data changes (one API migration)

| Table | Change |
|---|---|
| `lightning_tournaments` | `system` (`arena` / `swiss`, default `arena`); `rounds` (int, null until start for Swiss); `current_round` (int, default 0); `round_minutes` (int, default 40); `round_break_seconds` (int, default 60); `round_started_at`, `round_closed_at` (timestamps) |
| `lightning_games` | `round` (int, null for arena) |
| `lightning_byes` (new) | PK (`tournament_id`, `user_id`, `round`): the bye each round gave, so nobody gets two and the bye counts in the score but not in Buchholz |

Arena rows keep working unchanged: `system` defaults to `arena`, and arena never reads the new columns.

## Rounds

- **Count.** `rounds` given at creation is used as is (2 to 9). Null means `ceil(log2(players))` at start, at least 3: 4 players → 3, 8 → 3, 16 → 4, 32 → 5, 64 → 6.
- **Fixed at start.** The count is written when the tournament starts and never changes, so players know how long they are in.
- **Estimated end.** `ends_at` stays in the row (the schema requires it) and means the estimate shown to players: `starts_at + rounds × (round_minutes + round_break_seconds)`, computed at creation from `max_players` and recomputed at start.
- **Barrier.** Round N + 1 is paired only when every game of round N is resolved and the break is over.

## Pairing a round (`pairSwissRound`, pure)

Input: the active entries with score and Buchholz, the opponents each one has already faced, and who already had a bye.

1. **Round 1.** Random order from a seeded shuffle (`tournament.id` + round number), so a retried tick pairs the same way.
2. **Later rounds.** Sort by score, then Buchholz, then registration time. Walk the score groups from the top; inside a group, pair each player with the best-placed partner they have not faced. A player left over drops into the next group.
3. **No rematch in the whole tournament.** When the greedy walk cannot avoid one, the pass backtracks over the last pairs of the round. Fields are at most 64, so a depth-limited backtrack is cheap. Only if no rematch-free pairing exists (very small fields in late rounds) is the rematch with the smallest score gap accepted.
4. **Bye.** With an odd field, the lowest-placed player who has not had a bye gets it: a win, 3 points, recorded in `lightning_byes`, no game, no Buchholz contribution.

The pure function returns pairs plus the bye; `PairLightningPlayers` keeps issuing one reservation per pair exactly as today, now tagging each game with its round.

## Resolving games in Swiss

`resolveLightningGame` is unchanged; only what a resolution means for the entries differs.

| Record | Arena (today) | Swiss |
|---|---|---|
| decided / draw | 3 / 1 / 0 | same |
| abandon after the start | loss for the leaver | same |
| no-show of one seat | no points, player paused | **loss** for the absent seat, win for the present one; a second no-show drops the player |
| neither seat joined | both paused | **double loss**; both get a no-show strike |
| infrastructure void (restart, room closed before the start) | nothing counted, re-paired | the same pair gets a new reservation in the same round |
| round deadline with no result | (no deadline) | **draw** for both, reservation revoked |

Swiss has no pause: a player who cannot keep playing drops (`withdraw`). A drop during a live game still has that game's result applied for the opponent.

## Round deadline

A reservation cannot cap a duel's total length (the limit is per turn), so a hung or stalled game could hold the round barrier forever. Each round has a deadline: `round_started_at + round_minutes`. When it passes, every game of the round still without a terminal `reserved_duels` row is closed as a draw and its reservation revoked. If the room is still live (`in_use`), its later result is ignored, because `lightning_games.status` is already `applied`. The client shows the deadline as the round clock, so players know when time is called.

With 90 s per turn, 40 minutes covers more than 25 turns, beyond any normal duel.

## Standings

Swiss orders by score, Buchholz, wins, registration time. Buchholz goes ahead of wins here because every player plays the same number of rounds, so strength of schedule is the meaningful tiebreak. Byes add 3 points to the score and nothing to Buchholz.

## Endpoints

No new routes.

- `POST /lightning` accepts `system`, `rounds`, `roundMinutes` and `roundBreakSeconds`.
- `TournamentView` gains `system`, `rounds`, `currentRound`, `roundEndsAt` and `nextRoundAt`.
- `GET /lightning/{id}` gains `round`: the current round's pairings, with each table's players, result once applied and watch room.
- `GET /lightning/{id}/me` gains `bye` (true when the viewer has the bye this round). The `away` state never appears in Swiss.
- `POST /lightning/{id}/entries/me/pause` answers 422 in Swiss.

## Client

- Header shows "Ronda 2 de 4" and the round clock: time to the deadline while the round is live, time to the next round during the break.
- The waiting room covers three new moments: "Esperando a que termine la ronda" after the player's game is applied, the break countdown, and "Tienes descanso esta ronda (+3)" for the bye.
- A "Ronda actual" panel lists the tables of the round with their results as they come in, and the watch action per table.
- No pause button in Swiss; withdraw stays.
- List and home cards label the system ("Suizo · 4 rondas" / "Arena · 30 min").

## Failure modes

| Failure | Effect |
|---|---|
| A game never ends | the round deadline closes it as a draw |
| Server restart mid-round | infrastructure void → the same pair gets a new reservation in the same round |
| Redis down when a round must be paired | the pairing pass rolls back and retries next tick; the round starts late |
| API down at the end of a round | the round closes on the next tick after the API returns |
| A player drops mid-round | the game resolves normally; the player is not paired again |
| Field shrinks to one active player | the remaining rounds are skipped and the tournament completes |

## Not in scope

Top cut by brackets, best-of-3 rounds (the reservation supports `match`; it would need longer round deadlines), seeding round 1 by season ranking, a judge override of a result.
