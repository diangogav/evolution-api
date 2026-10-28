# Halloween event runs — architecture

A signed-in player picks one of three fixed decks and duels eight waves of Edison bots of rising difficulty until they lose (each wave's rival is drawn from that wave's pool, see **Wave pools**); prizes are cumulative tiers at 3 / 5 / 8 waves cleared. The API owns every event rule. The duel server stays duel-only: it gains one generic capability, **reserved duels** (a room built from a server-side reservation whose outcome is recorded under the reservation id), and never learns what an event, run, wave, attempt or prize is. The server and the API never call each other; they share Redis (reservations, as game tickets do today) and Postgres (duel records, as `matches` do today).

## Quick path

```
Client  POST /events/{eventId}/runs {deckId}     → API    lock (user,event); conditional attempt upsert; run {wave 1, ready}
Client  POST /event-runs/{runId}/duel            → API    lock run; refuse if a duel is live; SET duel:reservation:<id> (TTL 10 min);
                                                          run.current_reservation_id = <id>; return {password "rv#<id>", wave, botName, deck}
Client  WS handshake (game ticket) + pass rv#<id> → Server atomic claim (ticket user must be a participant); INSERT reserved_duels
                                                          (+ participants); create the room from the reservation's format/mode/options;
                                                          request the bot (existing AIJOIN# path); enforce required decks
Server  duel begins                               → UPDATE reserved_duels SET started_at
Server  game over (existing GameOverDomainEvent)  → plugin: UPDATE … SET outcome decided|draw, winner_seat, ended_at   (one row, in place)
Server  room finalized without game over          → core: UPDATE … SET outcome abandoned, abandoned_by_seat, reason, ended_at; DEL key
API     GET /event-runs/me (on demand) + worker tick (anti-join) → ApplyReservedDuel (idempotent)
Client  short-polls GET /event-runs/me after the duel → interstitial or summary
```

## Boundaries

| Component | Owns | Never does |
|---|---|---|
| evolution-api | events, catalog, runs, attempts, reservation issuance, applying duel records, prizes | joins rooms, talks to WindBot, writes `reserved_duels` |
| EDOpro-server-ts | reserved-duel join, required-deck check, writing its own `reserved_duels` rows | reads event tables, decides waves/attempts/prizes, calls the API |
| evolution-card-game | banner, narrator, deck pick, ladder, launching the duel with a forced deck, interstitial/summary | reports results, decides progress |
| windbot | playing the wave decks | anything event-related |

The reserved-duel capability is generic on purpose: any pre-arranged duel (this gauntlet, future seasonal gauntlets, tournament brackets, challenges, tutorial duels) is a reservation plus a result row, for one human against a bot or two humans against each other. It reuses the existing duel machinery end to end: rooms, the engine, WindBot (`AIJOIN#` token join), banlist validation, game tickets, the abandon grace (`AbandonBetweenDuels` / `EndMatchByAbandon`) and the game-over event (`GameOverDomainEvent`, which already carries every player's team and `winner`, the same data `UnrankedMatchSaver` persists today). What is new is only: claiming a reservation, the deck lock, and recording the outcome under the reservation id, including the abandon cases that produce no game over. The word "event" does not appear in the server.

## Contract 1 — reservation (Redis; API writes, server claims)

Key `duel:reservation:<id>`, `<id>` = 16 base62 chars, password `rv#<id>` (19 chars; CTOS pass limit is 20, see `EDOpro-server-ts/src/ygopro/room/domain/RuleMappings.ts:459-466`). TTL 10 minutes until claimed.

```json
{
  "v": 1,
  "reservationId": "<id>",
  "format": "edison",
  "mode": "single",
  "participants": [
    { "seat": 0, "kind": "user", "userId": "<uuid>",
      "requiredDeck": { "main": [12345678], "extra": [87654321], "side": [] } },
    { "seat": 1, "kind": "windbot", "botName": "Haunted" }
  ],
  "options": { "spectators": false, "listed": false, "reconnect": false,
               "deckLock": "exact", "lobbyTimeoutSeconds": 120 },
  "claim": null
}
```

| Field | Values |
|---|---|
| `mode` | `single` (exactly one duel; a draw ends it) or `match` (best of 3 with side-decking, the existing `m`/`edm` rules) |
| `participants` | 2 seats; seat = team (0 = `Team.PLAYER`, 1 = `Team.OPPONENT`). `kind: "user"` joins with a game ticket; `kind: "windbot"` is requested by the server. Both seats may be users. `requiredDeck` is optional per user seat |
| `options.deckLock` | `exact`: the deck must equal `requiredDeck` per section and cannot change. `registered`: main + extra + side together must equal the registered multiset (side swaps between duels of a match allowed). Without `requiredDeck` only the banlist applies |
| `options.reconnect` | `false`: a human disconnect ends the room at once (today's AI-room behaviour). `true`: the existing reconnect window and abandon grace apply, as in normal human rooms |
| `options.spectators`, `options.listed` | watchers allowed; room shown in the room list |
| `options.lobbyTimeoutSeconds` | how long the room waits for every human seat before ending as `abandoned` / `no_show` |
| `claim` | `null` until the server claims it; then `{ "instanceId", "at" }` |

**Claim and revoke are atomic** (Lua scripts on the key, so they serialize):
- Server `claim(id, instanceId, userId)`: key missing → `missing`; `userId` not a `user` participant → `not_participant` (key untouched, so a leaked password cannot burn it); `claim` null → set it, extend TTL to a safety ceiling (6 h) → `claimed`; `claim.instanceId` = this instance → `already_claimed_here`; other instance → `claimed_elsewhere`.
- API `revoke(id)`: key exists and `claim` null → delete → `revoked`; claimed → `in_use`; missing → `gone`.

Server join (new core strategy in the base chain, before `TicketJoinStrategy`, so it exists whether or not WindBot is enabled):
1. Match `ctx.command === "rv"`; require `ctx.socket.resolvedUserId`.
2. `claim`. `missing` / `not_participant` / `claimed_elsewhere` → JOINERROR (`claimed_elsewhere` is the fail-safe for multi-instance deployments: a reservation lives on the instance that claimed it; production runs one instance).
3. `claimed` (first join): `INSERT reserved_duels` and one `reserved_duel_participants` row per seat, then create the room from `format`/`mode`/`options` only: `noHost` (the server starts the duel when every seat is ready), seats fixed by `seat`, deck checking forced on (ignore `no_check_deck`), `listed`/`spectators` from options, `noReconnect = !options.reconnect`. WindBot seats are requested by name through `WindbotModule.requestBot`; the bot joins through the existing `AIJOIN#` path.
4. `already_claimed_here` (a later human): find the room by reservation id. No live room (the row is terminal) → JOINERROR. Mark the seat with `UPDATE reserved_duel_participants SET joined_at = now() WHERE … AND joined_at IS NULL`; zero rows (seat already taken) → JOINERROR.
5. Deck check: after normal banlist validation, apply `deckLock` against the seat's `requiredDeck` in the waiting state and in the side-decking state; mismatch → not ready + DECKERROR. With `exact`, a re-sent deck after ready is rejected.
6. `mode: single`: the first duel's end finishes the match whatever the result, a draw included. In the core a draw does not finish a match (`shared/room/domain/match/domain/Match.ts:83-85,120-122`) and leads to side-decking; single reserved rooms finish instead, so the game-over event fires with no winner.
7. When the room finalizes, the server deletes the key.

## Contract 2 — `reserved_duels` (Postgres; server writes, API reads)

Server-owned tables in the game-server schema (same database as the API's cosmetics tables; created by a game-server migration, vendored read-only under `src/evolution-types/` in the API).

`reserved_duels`:

| Column | Notes |
|---|---|
| `reservation_id` PK | from the key |
| `format`, `mode`, `room_id`, `match_id` | `match_id` null until assigned |
| `server_instance_id` | the claiming instance |
| `joined_at`, `started_at`, `ended_at` | `joined_at` = first join; `started_at` null = the first duel never started |
| `outcome` | `decided`, `draw`, `abandoned` |
| `winner_seat` | winning team when `decided`, taken from the game-over event's `players[].team`/`winner` (already mapped from engine positions by the core) |
| `abandoned_by_seat` | seat that left or never showed when `abandoned`; null for `server_restart`, `bot_unavailable` |
| `reason` | win reason code, `timeout`, `disconnect`, `room_closed`, `no_show`, `bot_unavailable`, `server_restart` |
| `duels` | jsonb, one entry per duel of a match: winner seat and reason |

`reserved_duel_participants`: PK (`reservation_id`, `seat`), `kind`, `user_id` or `bot_name`, `joined_at`.

**Who writes what:**
- Core join strategy: the rows at first join, seats on later joins.
- Core dueling state: `started_at` on the first duel start.
- **Plugin `reserved-duels`** (a `GameOverDomainEvent` subscriber, like `UnrankedMatchSaver`; the event gains the room's `reservationId`): `outcome = decided | draw`, `winner_seat`, `duels`, `reason`, `ended_at` with `UPDATE … WHERE ended_at IS NULL`. Retries with backoff.
- Core `FinalizeYGOProRoom`: for rooms that never reached game over (an in-memory flag set when game over is dispatched), `outcome = abandoned` with the seat and reason passed by the caller (disconnect policy, lobby timeout, WindBot failure), same conditional update. Rooms that did reach game over are left to the plugin, so the two writers never race. With `reconnect: true` a disconnect goes through the existing abandon grace, whose outcome arrives as a normal game over.
- Boot: each process closes its own leftovers, `UPDATE reserved_duels SET ended_at = now(), outcome = 'abandoned', reason = 'server_restart' WHERE ended_at IS NULL AND server_instance_id = $self`. The instance id is configured and stable per deployment slot.

## API — `event-run` module

Follows `.agent/skills/evolution-api-modules/SKILL.md`. Tables (cosmetics DataSource, raw-SQL migrations):

| Table | Key points |
|---|---|
| `event_catalog` | window, attempts/day, ordered waves `{ tier, pool }`, decks (id, card lists, `botName` of the WindBot that pilots it), prize tiers jsonb (`LocalizedText`) |
| `event_runs` | `status`, `current_wave`, `waves_cleared`, `current_bot` (rival drawn for the current wave), `faced_bots` (jsonb, rivals of cleared waves in order), `current_reservation_id`, `voids`; partial unique index: one `ready` run per (user, event) |
| `event_run_attempts` | PK (user, event, period_key), UTC day from `rewards/domain/MissionPeriod.ts`, counted at run start |
| `event_run_reservations` | PK `reservation_id`, `run_id`, `wave`, `bot_name`, `issued_at`: the reservations this module issued; the only ones it ever reads back |
| `event_run_duels` | PK `reservation_id` → each duel record is applied once |

**Run states:** `ready`, `won`, `lost`, `expired`, `superseded`.

**Wave pools:** waves 1-2 draw from easy {Haunted, Skeletons, Horde}, 3-4 medium {Archfiends, Vampires, Witches}, 5-6 hard {DarkWorld, CursedGarden, Necromancer} (the player decks piloted by WindBot), 7 miniboss {Lich}, 8 boss {Gravekeepers}. The rival is drawn (`domain/WaveRival.ts`, randomness behind the `PickIndex` port) when the wave becomes current: at run start for wave 1 and right after each applied win. It is never the bot of the player's own deck (`decks[].botName`) and never a bot already in `faced_bots`; if those rules would empty a pool, only the mirror rule is kept. The rival is stored on the run and on each reservation, so a voided duel is retried against the same bot and every reader sees the same one; a ready run stored without a rival gets one drawn on its next read or duel request.

**Reservations (`RequestEventDuel`, `SELECT … FOR UPDATE` on the run):** with a current reservation, the API first applies its record if terminal (below). If the run is still `ready` and the current reservation has no terminal row, it calls `revoke`: `revoked` or `gone` (never claimed) → the old reservation is dropped and a new one issued; `in_use` (claimed, duel live) → 409. Because claim and revoke are atomic on the same key, a reservation is either claimed by the server or revoked by the API, never both, so no duel can run under a reservation the run has forgotten. Each issued reservation is recorded in `event_run_reservations`; the run's participants are seat 0 = the player with the run's deck (`deckLock: exact`) and seat 1 = the wave's WindBot, `mode: single`, not listed, no spectators, `reconnect: false`.

**Pending result first:** under the same run row lock, before deciding anything, the API applies any terminal, not-yet-applied `reserved_duels` record for `current_reservation_id` through `ApplyReservedDuel` (same transaction). It then decides on the run's resulting state: a new reservation is issued only if the run is still `ready`; otherwise the request returns the run's new state (e.g. `lost` or `won`) and issues nothing. A finished duel is never skipped as non-current, so there is no free retry after a loss and no dropped win.

**Applying a duel record (`ApplyReservedDuel`, one transaction):** insert into `event_run_duels` (conflict → already applied, stop); ignore and log a record whose `reservation_id` ≠ `current_reservation_id`; then, with the player at seat 0 and the wave bot at seat 1 (as the API issued them):

| Record | Transition |
|---|---|
| `decided`, `winner_seat = 0` | `waves_cleared++`; grant any tier crossed (3/5/8); wave 8 → `won`, else `ready` at wave + 1 |
| `decided`, `winner_seat = 1`, or `draw` | `lost` |
| `abandoned` with `started_at` set (`disconnect`, `room_closed`) | `lost` |
| `abandoned` with `started_at` null and `abandoned_by_seat = 0` (lobby leave, `no_show`) | voided, `ready` same wave, `voids++`; `voids > 3` → `lost` |
| `abandoned` with `started_at` null and no seat (`room_closed`, `bot_unavailable`, unplayable reservation) | voided, `ready` same wave, no void counted (the player did not cause it) |
| `abandoned`, `server_restart` or `bot_unavailable` | voided, `ready` same wave, no void counted (infrastructure, not the player) |

`current_reservation_id` is cleared after applying.

**Stale duel:** stalling is not possible (the engine ends the duel and the stalling player loses on response timeout, `ygopro/ocgcore-worker/ocgcore.ts:1035-1043`). A row with no `ended_at` whose `joined_at` is older than 2 hours (started or still in the lobby) therefore means an infrastructure failure: the worker voids it (no void counted), logs an alert, and the run returns to `ready`. The void is recorded in `event_run_duels`, so a late terminal write for that reservation is ignored.

**Runs left mid-way:** prizes are granted the moment a tier is crossed, so nothing needs settling. A `ready` run with no live duel for 24 h, or at event close, becomes `expired`. The worker revokes the reservation an expired run dropped once its transaction commits (best effort, logged), so an issued but unclaimed reservation cannot be played after the run ended. Starting a new run while an old one is `ready` marks the old one `superseded` (the new run spends an attempt); while a duel is live → 409. `StartEventRun` first applies the pending terminal records of the user's existing run (same transaction, under its row lock) and only then supersedes it, and only if it is still `ready`; a run that just became `won` or `lost` is not superseded.

**Attempts:** `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 WHERE count < max RETURNING` in the same transaction as the run insert; no row returned → 422.

**Prizes:** essence via `essence_ledger` with a new enum value `event_run` (migration `ALTER TYPE essence_ledger_kind_enum ADD VALUE 'event_run'` in its own migration, outside the transaction that first uses it, plus `ESSENCE_LEDGER_KINDS`) and `reference_key = event:<eventId>:tier:<n>`; the unique (user, kind, reference_key) index makes "best mark" automatic. Cosmetics through the existing per-(user, cosmetic) entitlement grant (idempotent); event cosmetics are exclusive (no shop price).

**Where it runs:** applying happens on `GET /event-runs/me` for that user (immediate feedback) and in a tick of the existing lock-guarded worker (`src/worker.ts`). The tick does not use a cursor (retried terminal writes can commit out of `ended_at` order): it selects the module's own `event_run_reservations` whose `reserved_duels` row has `ended_at` set and that have no `event_run_duels` row, plus the stale rows above; reservations issued by other features (tournaments, challenges) are never read. Each reservation is applied under its own savepoint: one that throws is rolled back, logged and retried on the next tick while the rest of the batch commits. Both schemas live in the same Postgres database, so the apply transaction reads `reserved_duels` with a plain query on the cosmetics connection while holding the run row lock. Volume is small (one row per event duel). No blocking reads, no new Redis connection.

**Endpoints** (bearer + `banGuard`, OpenAPI ratchet):

| Method | Path | Notes |
|---|---|---|
| GET | `/events/{eventId}` | catalog (`waves: [{ wave, tier, pool }]`), attempts left today, best mark |
| POST | `/events/{eventId}/runs` | 409 if a duel is live; 422 if no attempts left or event closed |
| POST | `/event-runs/{runId}/duel` | `{ password, wave, botName, deck }` with the run's drawn rival; 409 if a duel is live |
| GET | `/event-runs/me?eventId=` | applies pending records, returns current or last run (`botName` = drawn rival, null once ended; `facedBots`; `lostTo` = rival of the wave a lost run fell on, else null) |

## Client — `halloween-event` feature

Follows `evolution-card-game/.claude/skills/svelte-5/SKILL.md`. Banner on `HomePage.svelte` gated by `resolveSeasonalTheme()` and session; route `/events/halloween`: narrator, deck choice (`DefaultDecksCatalog.loadTemplate`), ladder, attempts left. Launch with `duelOverlayStore.startEventDuel(password, deck)`: a new seam that forces and locks the deck for that duel. After `phase === 'finished'` or overlay close, short-poll `GET /event-runs/me` until the reservation is applied.

## Failure modes

| Failure | Effect |
|---|---|
| API down | no new runs or reservations; live duels still record; applied when the API returns |
| Redis down | no joins (as with ranked tickets) |
| Server crash / restart | boot sweep → `server_restart` → voided, retry same wave |
| DB down at room end | terminal write retries; if lost, the 2 h stale rule voids and alerts |
| Player leaves mid-duel | `abandoned` + `started_at` → `lost` |
| Player leaves the lobby / bot fails | voided, retry same wave (max 3 voids) |
| Leaked password | the claim script rejects non-participants without touching the key; spectators refused; room hidden |
| Join and reissue at the same instant | claim and revoke are atomic on the key: exactly one wins |
| WindBot down | `bot_unavailable` → voided, no void counted |
| Two reservation requests at once | run row lock; second gets 409 or the same live reservation |
| Record applied twice (worker + `/me`) | `event_run_duels` PK |
| Player requests a new duel before the result is applied | the pending record is applied first; no free retry |

## Not in scope

Leaderboards, tag duels, replays of event duels, changing WindBot. Tournaments themselves (brackets, pairings) are a future API module; this design only makes sure the reservation contract already supports them (two human seats, `match` mode, spectators, `registered` decks).
