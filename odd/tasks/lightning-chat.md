# Lightning tournaments — chat

Objective: one in-app text channel per lightning tournament: send by `POST`, receive by SSE, Postgres as the source of truth and Redis pub/sub as the fan-out between API instances.
Repos and branches: evolution-api `feat/lightning-chat` (chained PRs from `main`); evolution-card-game `feat/lightning-chat` (against the HTTP contract below). The duel server and evolution-types need nothing. Delivery: chained PRs per repo (≤700 changed lines each). Test runners: `bun test` (api), vitest touched files + build (client).
Design: `docs/design/lightning-chat.md` (written 2026-11-10; not yet reviewed).

## Specs

- S1 Channel: in-app, one per tournament; not a Discord thread (chosen by the user in the previous session).
- S2 Access: read = any signed-in, non-banned player; write = players with an entry in the tournament (any status) and admins; writing open in `registration`, `running`, `finishing`. Default proposed 2026-11-10 and taken when the user said "avancemos"; widening writers needs no schema change.
- S3 Message: 1–200 characters after trimming, no control characters; table `lightning_chat_messages` with a `bigserial` id used as the SSE event id; soft delete by admins.
- S4 Stream: `GET /lightning/{id}/chat/stream`, events `message` and `deleted`, replay after `Last-Event-ID` (cap 200), heartbeat every 25 s, `X-Accel-Buffering: no`, limits 3 streams per user and 2,000 per instance.
- S5 Fan-out: channel `lightning:chat:{tournamentId}` on a dedicated subscriber connection (a subscribed Bun `RedisClient` takes no other commands); publish after commit, a lost publish is recovered by replay.
- S6 Moderation: `requireUser` (ban check) on every route, 5 messages per 10 s per user and tournament (429), admin delete pushed live.
- S7 HTTP contract: `GET /lightning/{id}/chat?before=`, `GET /lightning/{id}/chat/stream`, `POST /lightning/{id}/chat {body}`, `DELETE /lightning/{id}/chat/{messageId}` (admin); message view `{ id, tournamentId, author: { userId, username, admin }, body, createdAt }`.

## Tasks

| ID | Repo | Task | S# | Route | Risk | Status | Commit |
|---|---|---|---|---|---|---|---|
| T1 | api | Migration `AddLightningChat…` (`lightning_chat_messages`, CHECK, index, FK cascade); domain `LightningChatMessage` (body rules) and repository port; Postgres repository (insert, page before id, after id with cap, soft delete) | S3 | delegated | 1 persisted schema (additive) | pending | |
| T2 | api | `TooManyRequestsError` mapped to 429; Redis rate limiter port and adapter | S6 | delegated | 3 shared error map (additive) | pending | |
| T3 | api | Use cases `PostLightningChatMessage` (tournament state, entrant or admin, rate limit, insert, publish), `GetLightningChatHistory`, `DeleteLightningChatMessage`; `LightningChatPublisher` port | S2, S3, S6 | delegated | none | pending | |
| T4 | api | Redis fan-out: publisher on the shared client, `LightningChatHub` with its own subscriber connection, per-tournament local registry, subscribe on first stream, unsubscribe on last | S5 | delegated | 4 concurrency (subscribe/unsubscribe races) | pending | |
| T5 | api | Routes: history, post, admin delete, SSE stream (replay + buffered live events, heartbeat, headers, stream limits); TypeBox schemas and OpenAPI | S4, S7 | delegated | 3 shared contract (additive) | pending | |
| T6 | api | Docs: architecture index, operations note (one extra Redis connection per instance) | S4 | delegated | none | pending | |
| T7 | client | `ChatMessageList` presentational (props instead of the global `chatStore`), duel chat unchanged | S7 | delegated | 2 shared UI | pending | |
| T8 | client | Chat ports, HTTP API, `fetch`-based SSE feed with backoff and `Last-Event-ID`, store, lazy panel in the tournament page | S4, S7 | delegated | none | pending | |
| T9 | all | Migration in dev, local end-to-end with two clients and two API instances | S1–S7 | inline | 5 | pending | |

## Log

- L1 (2026-11-10): design written.
