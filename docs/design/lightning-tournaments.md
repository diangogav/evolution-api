# Lightning tournaments — architecture

A lightning tournament is a short, self-running arena: registration opens, the API pairs idle players continuously for a fixed window, every duel is a single reserved duel with a short per-turn time limit on the game server, results come back through `reserved_duels`, and the API closes the tournament with standings, season points and prizes. It is a module inside this API (`src/modules/lightning`), not a separate service: the previous attempt (`evolution-tournaments`) duplicated identity, owned its own database, modelled teams, groups and four formats, and never touched the duel server, which is the only hard part. This design keeps the server duel-only and reuses the reserved-duel contract shipped for the Halloween event (`docs/design/halloween-event-runs.md`).

## Format decision: arena, not brackets

| Format | Fit for Yu-Gi-Oh! duels of 5–25 minutes | Verdict |
|---|---|---|
| Single elimination | needs a power of two, half the field leaves after one duel, the final waits for the slowest branch | no |
| Swiss (fixed rounds) | every round waits for its slowest duel; with a 3x spread in duel length most players sit idle most of the time | later, as a pairing policy |
| Arena (fixed window, continuous pairing) | no round barrier: whoever is idle gets paired at once; late joiners allowed; unknown field size is fine; ends on the clock | **v1** |

Arena is what chess.com runs for its quick tournaments and it is the only format whose wall-clock duration is fixed regardless of field size or duel length (new pairings stop at the end time; only the duels already running finish). Pairing is a pure function behind a port (`PairingPolicy`), so Swiss rounds can be added without touching the flow.

Scoring: win 3, draw 1, loss 0. No streak bonus in v1. Standings tiebreak: score, then wins, then sum of opponents' scores (Buchholz), then earliest registration.

## Quick path

```
Admin   POST /lightning                                  → API    schedules (registration window, play window, format, turn time)
Player  POST /lightning/{id}/entries {deck}             → API    validates the deck against the format's list; entry active, deck locked
Worker  tick at starts_at                               → API    < minPlayers → cancelled; else running, every entry idle
Worker  pairing tick (every 5 s while running)          → API    idle players sorted by score → pairs; one reservation per pair
                                                                  SET duel:reservation:<id> (mode single, 2 user seats, registered decks,
                                                                  turn time tm); INSERT lightning_games(reservation_id); entries → paired
Client  GET /lightning/{id}/me (poll 3 s)               → API    { state: paired, password "rv#<id>", seat, opponent }
Client  WS handshake (game ticket) + pass rv#<id>       → Server claim; create the room from the reservation; both seats ready → duel
Server  game over / abandon                             → Server UPDATE reserved_duels (existing plugin and core paths)
Worker  apply tick + /me                                → API    ApplyLightningGame: score, entries back to idle, next pairing
Worker  tick at ends_at                                 → API    finishing: no new pairings; live games finish
Worker  no live games                                   → API    completed: standings, lightning_results, lightning_rankings, essence
```

## Boundaries

| Component | Owns | Never does |
|---|---|---|
| evolution-api | tournament catalog, entries, deck registration, pairing, reservation issuance, applying game records, standings, season ranking, prizes | joins rooms, writes `reserved_duels`, calls the server |
| EDOpro-server-ts | reserved-duel rooms (already shipped), one new reservation option: the turn time | reads tournament tables, pairs anyone, awards points |
| evolution-card-game | tournament list, registration with deck pick, waiting room, auto-launch of each paired duel, live standings | decides pairings or results |
| evolution-backoffice | creating and cancelling tournaments through the admin endpoints | anything the API does not expose |

The word "tournament" does not appear in the server.

## Server change (one, small — shipped on `feat/reservation-clock`)

`reservedRoomCommand` built `"<format>[,m]#<hex>"` and nothing else reached the rule parser, so a reservation could not set a time limit. The reservation contract now takes `options.turnTimeSeconds?: number` (integer, 60–998; version stays 1, field optional) and the command emits the existing `tm` token (`tm<minutes>` for whole minutes, `tm<seconds>` otherwise). The limit is **per turn**, not per duel: the core worker resets each player's time to the full limit on every new turn (srvpro2 model), with the server default at 450 s. A player who runs out of turn time loses through the normal game-over path with `reason: timeout`; the API needs nothing special for it.

Consequence for the arena: a reservation cannot cap a duel's total length. A lightning duel is bounded in practice by the turn time (90 s per turn gives roughly 6 to 20 minutes for a typical 8 to 14 turn duel) and in the worst case by the stale rule in the `finishing` phase.

Reserved rooms have no ticket, so they are unranked: `UnrankedMatchSaver` still writes them to `unranked_matches` and the rewards worker counts them as casual duels for missions. Elo and ranked points are untouched. This is intended: tournament points live in `lightning_rankings`.

## Contract — reservation issued per pairing

```json
{
  "v": 1,
  "reservationId": "<16 base62>",
  "format": "tcg",
  "mode": "single",
  "participants": [
    { "seat": 0, "kind": "user", "userId": "<uuid>", "requiredDeck": { "main": [], "extra": [], "side": [] } },
    { "seat": 1, "kind": "user", "userId": "<uuid>", "requiredDeck": { "main": [], "extra": [], "side": [] } }
  ],
  "options": { "spectators": true, "listed": false, "reconnect": true,
               "deckLock": "registered", "lobbyTimeoutSeconds": 90, "turnTimeSeconds": 90 }
}
```

- `single`: one duel, a draw ends it (the server already finishes single reserved rooms on a draw).
- `deckLock: registered`: main + extra + side must equal the deck registered at entry; side swaps are irrelevant in single mode but the registered rule is the one that tolerates reordering.
- `reconnect: true`: the normal reconnect window and abandon grace apply, so a dropped connection is not an instant loss.
- `spectators: true, listed: false`: watchable from the tournament page (the client knows the room id from the pairing), hidden from the public room list.
- TTL 10 minutes until claimed, as today. The API revokes a reservation nobody claimed when it voids the game.

## Data — API-owned tables (cosmetics DataSource, raw-SQL migrations)

The shared schema already holds three empty tables from the retired proxy: `lightning_tournaments` (with a foreign key to the legacy server-owned `tournaments` table), `lightning_results` and `lightning_rankings`. They are owned by `evolution-types`. Because they share the database with this API, the names collide. Decision: **drop the three tables through an `evolution-types` migration and recreate them here**, owned by this API, after confirming in each environment that they are empty (export rows before dropping, per the usual rule). `lightning_rankings` keeps its shape because it already fits; the other two change.

| Table | Key points |
|---|---|
| `lightning_tournaments` | `id`, `name`, `format` (`tcg` / `edison` / `jtp`, as the matchmaking formats), `status`, `season`, `registration_opens_at`, `starts_at`, `ends_at`, `turn_time_seconds`, `lobby_timeout_seconds`, `min_players`, `max_players`, `points_by_position` jsonb, `essence_by_position` jsonb, `created_by`, `cancelled_reason`, timestamps |
| `lightning_entries` | PK (`tournament_id`, `user_id`); `registered_at`; `status` (`active`, `withdrawn`, `removed`); `presence` (`idle`, `paired`, `playing`, `away`); `deck` jsonb (the registered lists); `score`, `wins`, `draws`, `losses`, `games_played`, `no_shows`; `last_opponent_id`; `idle_since` |
| `lightning_games` | PK `reservation_id`; `tournament_id`; `seat0_user_id`, `seat1_user_id`; `issued_at`; `status` (`pending`, `applied`, `voided`); `resolution` (`seat0_win`, `seat1_win`, `draw`, `void`, `no_show`); `reason`; `applied_at` |
| `lightning_results` | PK (`tournament_id`, `user_id`); `position`, `score`, `wins`, `draws`, `losses`, `tiebreak`, `points_awarded`, `essence_awarded` |
| `lightning_rankings` | unique (`user_id`, `season`); `points`, `tournaments_won`, `tournaments_played` |

Every write that reads `reserved_duels` happens on the cosmetics connection with a plain query, as the event-run module does. The API reads only rows whose `reservation_id` is in `lightning_games`.

## Tournament states

```
scheduled ─(registration_opens_at)─▶ registration ─(starts_at, entries ≥ min)─▶ running ─(ends_at)─▶ finishing ─(no live games)─▶ completed
     │                                     │
     └────────── admin cancel ─────────────┴─(starts_at, entries < min)─▶ cancelled
```

- `scheduled`: visible in the list with a countdown; no entries.
- `registration`: `POST /lightning/{id}/entries` allowed until `starts_at`; late registration while `running` is allowed too (arena), the late entry starts at 0 and is paired on the next tick.
- `running`: pairing and applying ticks are active.
- `finishing`: no new reservations; the worker applies the remaining games. A game whose `reserved_duels` row has no `ended_at` 45 minutes after it was issued (`LIGHTNING_STALE_GAME_MINUTES`, configurable) is voided and logged as an error: with a 90 s turn limit no honest duel lasts that long.
- `completed`: standings frozen; `lightning_results`, `lightning_rankings` and essence written in one transaction; idempotent on the tournament row status (`UPDATE … WHERE status = 'finishing'` guards the writer).
- `cancelled`: entries released; a running tournament cancelled by an admin voids live games and awards nothing.

## Pairing tick (`PairLightningPlayers`, worker, lock-guarded)

Runs every 5 s per `running` tournament, inside a transaction holding `SELECT … FOR UPDATE` on the tournament row (the same lock the apply path takes, so pairing and applying never interleave for one tournament).

1. Candidates: `status = active AND presence = idle`.
2. Sort by `score DESC, idle_since ASC`.
3. Walk the list: each player takes the best-placed idle player who is not their last opponent, however far down the list. When only the last opponent is idle, the player waits for someone else to finish. The one exception is a tournament with only two playable entries left (active and not away): they may face each other again, or they would wait forever. An odd player stays idle for the next tick (no byes; the arena gives no points for waiting).
4. Per pair: generate a reservation id, issue the reservation (`SET … EX NX`), insert `lightning_games`, set both entries `presence = paired`, `last_opponent_id`. The Redis write happens after the row inserts in the same tick; if it fails the transaction rolls back and the pair is retried next tick.

The policy (steps 2–3) is `domain/pairIdlePlayers.ts`, pure and unit-tested; a Swiss or rating-aware policy replaces it without touching the tick.

## Applying a game (`ApplyLightningGame`, one transaction, idempotent)

Trigger: the worker tick (every 5 s: games `pending` whose `reserved_duels.ended_at` is set, plus the stale rule) and `GET /lightning/{id}/me` for the caller's current game. `UPDATE lightning_games SET status = 'applied' WHERE reservation_id = $1 AND status = 'pending'` returning zero rows means already applied: stop.

| `reserved_duels` record | Resolution | Entries |
|---|---|---|
| `decided`, `winner_seat = s` | `seat<s>_win`: +3 winner, +0 loser, `games_played++` both | both `idle` |
| `draw` | `draw`: +1 each, `games_played++` | both `idle` |
| `abandoned`, `started_at` set, `abandoned_by_seat = s` | the leaver loses: `seat<1-s>_win` | both `idle` |
| `abandoned`, `started_at` null, `abandoned_by_seat = s` (`no_show`, lobby leave) | `no_show`: no points; seat `s` gets `no_shows++` and `presence = away`; the other seat `idle` | away player must click "I'm back" (`POST …/entries/me/resume`); `no_shows ≥ 3` → entry `removed` |
| `abandoned`, `started_at` null, no seat (`room_closed`, `server_restart`) | `void`: nothing counted | both `idle` |
| no `ended_at`, stale | `void`, alert logged | both `idle` |
| no row at all 3 minutes after issue (nobody joined) | the reservation is revoked first; `revoked` or `gone` → `no_show` for both seats (`reason: unclaimed`); `in_use` → still pending | both `away` with a strike |
| any record while the tournament is `finishing` or later | same scoring, but entries are not returned to `idle` (nothing pairs anyway) | — |

The API also revokes the reservation on `void` and `no_show` so a late claim cannot start a duel the tournament has forgotten; `in_use` means the room is live and the record will arrive, so the game stays `pending`.

## Presence and leaving

- `presence = away` also happens when the player closes the tournament page: the client sends `POST …/entries/me/pause` on leave and the entry is skipped by pairing until `resume`. A paired or playing player cannot pause; the game runs its course.
- `DELETE /lightning/{id}/entries/me` withdraws. During a live game the withdrawal is recorded and applied when the game record arrives (the withdrawing player's result still counts for the opponent).
- A banned user (`requireUser` + `banGuard`) cannot enter; an existing entry of a user banned mid-tournament is `removed` on the next tick.

## Closing (`CompleteLightningTournament`)

Standings from `lightning_entries` (active and withdrawn with `games_played > 0`), ordered by score, wins, Buchholz, `registered_at`. Then, in one transaction guarded by the status update:

- `lightning_results`: one row per ranked player.
- `lightning_rankings`: `INSERT … ON CONFLICT (user_id, season) DO UPDATE SET points = points + $awarded, tournaments_played = tournaments_played + 1, tournaments_won = tournaments_won + (position = 1)`.
- Essence through `essence_ledger` with a new kind `lightning_tournament` (its own `ALTER TYPE … ADD VALUE` migration) and `reference_key = lightning:<tournamentId>:<userId>`; the unique (user, kind, reference_key) index makes a retry harmless.
- Trophies (achievements with `code: null`) stay manual for admins in v1.

Default `points_by_position`: 1st 10, 2nd 7, 3rd 5, 4th 3, every other participant with at least one game 1. Defaults are stored on the tournament row at creation, so changing them later never rewrites history.

## Endpoints (bearer, `banGuard`, OpenAPI ratchet)

| Method | Path | Notes |
|---|---|---|
| GET | `/lightning` | upcoming and running tournaments with entry counts; public |
| GET | `/lightning/{id}` | detail with standings (score, wins, draws, losses, games) and `watchable` games (room ids for spectators); public |
| POST | `/lightning/{id}/entries` | `{ deck: { main, extra, side } }`; 422 illegal deck or full; 409 already entered |
| DELETE | `/lightning/{id}/entries/me` | withdraw |
| POST | `/lightning/{id}/entries/me/pause` / `resume` | presence |
| GET | `/lightning/{id}/me` | applies the caller's pending game first, then `{ tournament, players, entry, state: idle \| paired \| playing \| away, game: { reservationId, password, seat, roomId, opponent } \| null, lastGame, position }`; `entry` and `state` are null for a player who did not enter |
| GET | `/lightning/rankings?season=` | season ranking from `lightning_rankings` |
| POST | `/lightning` (admin) | create: name, format, windows, turn time, min/max, point tables |
| POST | `/lightning/{id}/cancel` (admin) | cancel with reason |

Deck validation at entry reuses `validateDeck` and the list loaders from the `community-decks` module through its `index.ts` (sizes, copies, list legality). The server still runs its own banlist check at join, so an illegal deck can never duel; the API check exists so the player learns it at registration, not as a `no_show`.

## Client — `lightning` feature

Follows the Svelte 5 skill and the `leaderboard` feature layout (`domain/{dtos, ILightningApi}`, `application/LightningService`, `infrastructure/HttpLightningApi`, `state/lightningStore.svelte.ts`, `ui/`). Navigation entry in the `play` group; a "next lightning tournament" card on the home page next to live rooms.

- Registration: deck picker from the user's saved decks; the lists go in the entry request.
- Waiting room: standings, countdown, presence toggle. Live state comes through a `LightningFeed` port with one method, "my current state", implemented by polling `GET …/me` every 3 s while the page is open and nothing else. Polling is the decision for v1: the API runs on several instances with no push channel of its own, so a WebSocket or SSE would need Redis fan-out between the worker that pairs and the instance holding the connection, for a latency gain that the room join, deck load and RPS (20–60 s) make irrelevant; 64 players polling is about 20 primary-key reads per second. If push is ever needed, SSE replaces the port's implementation, not the UI.
- `state = paired`: launch `duelOverlayStore.startReservedDuel(password, deck)` (the event seam generalised: forced deck, reservation password, no "casual" token). On overlay close or `phase === finished`, poll `…/me` until the game is applied, then show the result inline and return to the waiting room.
- Spectating: watchable games open with the existing `w,<roomId>` join.

## Worker

`LightningWorker` in `infrastructure/`, same shape as `EventRunWorker` (`start`, `stop`, `runOnce(now)`, lock in the unit of work, `config.lightningWorker.enabled`), started from `src/index.ts`, `src/server/server.ts` and `src/worker.ts`. One tick: transitions by clock (`scheduled → registration → running/cancelled → finishing → completed`), then apply, then pair, per tournament, each under its own savepoint.

## Failure modes

| Failure | Effect |
|---|---|
| API down | no pairings or applies; live duels still record; everything resumes on the next tick |
| Redis down | reservations cannot be issued or claimed: pairing tick fails and retries; the tournament window still ends on time |
| Server restart | `server_restart` rows → voided, players back to idle |
| Player closes the client mid-duel | reconnect window; then abandon → loss for the leaver |
| Player never joins the room | `no_show` → away, third strike removes the entry; the opponent is re-paired at once |
| Both never join | both away, no points, no penalty beyond the strike |
| Slow duel at `ends_at` | finishes under `finishing`; the turn limit keeps it short, the stale rule voids a hung one |
| Field smaller than `min_players` at start | cancelled, nothing awarded |
| Record applied twice (worker + `/me`) | `lightning_games.status` guard |
| Two pairing ticks at once | tournament row lock plus the worker lock |
| Leaked `rv#` password | the server's claim rejects non-participants; room unlisted |

## Not in scope (v1)

Swiss rounds, best-of-3 matches, team tournaments, recurring schedules (an admin creates each tournament; a template-based scheduler is the obvious next step), streak bonuses, automatic trophies, push notifications, replays.
