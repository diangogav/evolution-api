# Web Push — phase 1 (lightning summons)

Objective: a player paired by a lightning tournament gets a system notification even when the app is in the background or closed.
Repos and branches: evolution-types `feat/push-subscriptions`; evolution-api `feat/web-push` (chained PRs from `main`); evolution-card-game `feat/web-push`. The duel server needs nothing in phase 1. Test runners: `bun test` (api), vitest touched files + build (client).
Design: `docs/design/web-push.md` (written 2026-11-11; not yet reviewed).

## Specs

- S1 Web Push with VAPID through the `web-push` library; Android Chrome, desktop browsers, iOS only as a home-screen app. Native shell not covered.
- S2 `push_subscriptions` in evolution-types (shared with the duel server in phase 2): unique endpoint, keys, locale, user FK with cascade; upsert by endpoint.
- S3 API routes: `GET /push/public-key` (public, null when unconfigured), `PUT` and `DELETE /me/push-subscriptions`.
- S4 Send after the worker tick commits, one push per subscription of each paired seat, TTL = lobby timeout, urgency high, topic per reservation; `gone` deletes the row; best effort, never blocks the tick.
- S5 Client: Workbox `importScripts` push handler (skip when a visible window exists, tag per reservation, click opens the tournament), opt-in control with states, iOS install hint, unsubscribe on sign-out, in-app browser notification through `registration.showNotification`.
- S6 Config `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; push off without them.

## Tasks

| ID | Repo | Task | S# | Route | Risk | Status | Commit |
|---|---|---|---|---|---|---|---|
| T1 | types | Entity and migration `push_subscriptions`; bump the submodule in the API | S2 | delegated | 1 persisted schema (additive, shared) | pending | |
| T2 | api | Spike: `web-push` sends from Bun 1.4 to a real push endpoint (encryption, VAPID headers) | S1 | inline | 3 dependency | pending | |
| T3 | api | Config, subscription repository, `PUT`/`DELETE /me/push-subscriptions`, `GET /push/public-key`, OpenAPI | S3, S6 | delegated | 3 shared contract (additive) | pending | |
| T4 | api | `PushSender` port + `web-push` adapter; pairing use cases return issued reservations; `NotifyLightningSummons` after commit; locale texts | S4 | delegated | 4 worker flow | pending | |
| T5 | client | Service worker push script + `importScripts`; in-app notification through the registration | S5 | delegated | 3 service worker | pending | |
| T6 | client | Push API client, subscription store, opt-in control on the tournament page and after entry, iOS hint, sign-out cleanup, i18n | S5 | delegated | none | pending | |
| T7 | all | Local end to end on Chrome desktop; Android over an HTTPS tunnel or production with the user's account | S1–S6 | inline | 5 | pending | |

## Log

- L1 (2026-11-11): design written.
