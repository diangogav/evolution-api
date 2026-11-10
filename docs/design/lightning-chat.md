# Lightning tournaments — chat

One text channel per lightning tournament, inside the client, so the players of a tournament can talk while they wait for pairings, between Swiss rounds and after the last game. It lives in the `lightning` boundary of this API (`docs/design/lightning-tournaments.md`); the duel server needs nothing.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Where | In-app, not a Discord thread | players already sit in the waiting room; a link out loses them |
| Transport | `POST` to send, one SSE stream per tournament to receive | one-way push is all a chat feed needs; plain HTTP keeps the existing bearer auth |
| Source of truth | Postgres first, then fan-out | a message the stream missed is never lost: reconnection replays from the table |
| Fan-out | Redis pub/sub, one channel per tournament | the API runs on several instances; the instance that takes the `POST` is rarely the one holding the reader's stream |
| Who reads | any signed-in player who is not banned | spectators follow the tournament too |
| Who writes | players with an entry in the tournament (any status) and admins | keeps the channel to the people playing; moderation stays small |
| When writing is open | `registration`, `running`, `finishing` | `scheduled` has no entrants yet; `completed` and `cancelled` are read-only |
| Length | 1–200 characters after trimming, no control characters | one line in the side panel |

Writers can be widened later (any signed-in player) without a schema change.

## Quick path

```
Player  GET  /lightning/{id}/chat                    → API    last 50 messages, newest last
Player  GET  /lightning/{id}/chat/stream              → API    SSE: replay after Last-Event-ID, then live events
Player  POST /lightning/{id}/chat {body}              → API    checks → INSERT → PUBLISH lightning:chat:{id}
API     subscriber on every instance                  → Redis  event → every stream of that tournament on this instance
Admin   DELETE /lightning/{id}/chat/{messageId}       → API    soft delete → PUBLISH a `deleted` event
```

## Data (one API migration)

`lightning_chat_messages`, in the cosmetics DataSource with the other `lightning_*` tables:

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | also the SSE event id; strictly increasing, so "after id N" is a range scan |
| `tournament_id` | `uuid` FK → `lightning_tournaments` | `ON DELETE CASCADE` |
| `user_id` | `varchar` FK → `users` | author, `ON DELETE CASCADE` (same key type as the other `lightning_*` user columns) |
| `body` | `varchar(200)` | `CHECK (char_length(body) BETWEEN 1 AND 200)` |
| `created_at` | `timestamptz` default `now()` | |
| `deleted_at`, `deleted_by` | nullable | soft delete by an admin |

Index `(tournament_id, id)`. Usernames and the author's `admin` flag (the current `users.role`) are read through the existing `PlayerDirectory` at view time, in one query per page, not stored per message.

## Endpoints (bearer through `requireUser`, which already rejects banned users; OpenAPI ratchet)

| Method | Path | Notes |
|---|---|---|
| GET | `/lightning/{id}/chat?before={messageId}&limit={n}` | page of `limit` (1–50, default 50), newest last; deleted messages come back as `{ id, deleted: true }` so the client can drop them |
| GET | `/lightning/{id}/chat/stream` | `text/event-stream`; see [Stream](#stream) |
| POST | `/lightning/{id}/chat` | `{ body }` → 201 with the message view; 404 unknown tournament; 403 not an entrant; 409 tournament not open for chat; 422 empty or too long; 429 rate limited |
| DELETE | `/lightning/{id}/chat/{messageId}` (admin) | soft delete; 204; idempotent; 403 not an admin; 404 unknown message or another tournament's |

Message view: `{ id, tournamentId, author: { userId, username, admin }, body, createdAt }`.

## Stream

- Events: `message` (the message view), `deleted` (`{ id }`) and `reset` (`{}`). The SSE `id:` field is the message id for `message`; `deleted` and `reset` carry no id so they do not move the replay cursor.
- Opening: an unknown tournament answers 404 before the stream opens. Without `Last-Event-ID` (or with one that is not a message id) the stream sends only live events: the client loads the history with `GET` first.
- Reconnection: the client sends `Last-Event-ID`; the API first streams every non-deleted message with a greater id, then live events. Beyond 200 it sends the first 200 and then `reset`, and the client reloads the history. Live events that arrive during the replay are buffered and deduplicated by id.
- The stream waits at most 5 s for its channel subscription before replaying: with Redis unreachable it still opens, without live events.
- Heartbeat: an SSE comment (`: ping`) every 25 s, so idle proxies do not close the connection.
- Headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (no proxy buffering for this response).
- Closing: the request's abort signal or the body being cancelled unregisters the stream and stops its heartbeat.
- Limits per instance: 3 open streams per user and 2,000 in total; above either the API answers 429.
- The client reads the stream with `fetch` and a `ReadableStream`, not `EventSource`: it needs the `Authorization` header and control of `Last-Event-ID`.

## Fan-out

- Channel `lightning:chat:{tournamentId}`, payload the event as JSON.
- A subscribed Bun `RedisClient` accepts only `subscribe`, `unsubscribe` and `ping`, so the subscriber is a second connection, separate from the shared `redisClient`.
- Each instance keeps `tournamentId → Set<stream>` in memory, subscribes to a channel when its first local stream opens and unsubscribes when the last one closes.
- Subscribe and unsubscribe calls for one channel run one after another, each checking the local streams when it runs, so a stream that opens while the last one closes never ends up without a subscription. A new stream waits for its channel's subscription before reading the replay, so no message falls between the replay and the live events. A failed subscribe is logged and retried on the next stream that opens or closes for that tournament.
- Publish happens after the insert commits. A publish that fails is logged and not retried: the message is in the table and reaches every reader on its next reconnection or history load.

## Moderation (v1)

- Rate limit per user and tournament: 5 messages per 10 s (Redis `INCR` + `EXPIRE`), answered with 429.
- Ban: `requireUser` on every route; a user banned while a stream is open keeps reading until it reconnects, but cannot post.
- Admin delete, pushed live.
- Not in v1: player reports on chat messages, word filter, mutes per tournament.

## Client — inside the `lightning` feature

- `ILightningChatApi` port (history, send, delete) and a `LightningChatFeed` port (stream) with an HTTP implementation that parses SSE from `fetch`, reconnects with backoff and resends `Last-Event-ID`.
- The duel chat's `ChatMessageList` reads the global `chatStore` directly; it becomes presentational (messages and callbacks as props) so the duel and the tournament share it.
- Panel in the tournament page, loaded lazily: the bundle is already over its budget.
- The stream opens only while the tournament page is visible and closes on leave or when the tab is hidden.

## Failure modes

| Failure | Effect |
|---|---|
| Redis down | `POST` fails at the rate limit (500); streams stay open but get no live events; history still loads |
| Publish lost | readers see the message on reconnection or history reload |
| Instance restart | its streams drop; clients reconnect to another instance and replay after `Last-Event-ID` |
| Client misses a `deleted` event | the next history load returns the message as deleted |
| Flood from one user | 429 after 5 messages in 10 s |

## Not in scope (v1)

Direct messages, mentions, emotes in chat, reports on chat messages, chat for ranked or casual rooms, replacing the lightning `/me` polling with this stream (possible later: same channel, one more event type).
