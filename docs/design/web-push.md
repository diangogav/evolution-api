# Web Push notifications

A player who leaves the app (another app on the phone, a closed tab) does not learn that a lightning tournament paired them, and the room's lobby timeout turns the game into a no-show. Polling cannot fix it: mobile browsers throttle and then freeze background pages. Web Push lets the server reach the device through the browser's push service, which wakes the app's service worker even when no page is open.

Phase 1 (this design): the API sends a push when a lightning tournament pairs a player. Phase 2 (later): the duel server reuses the same subscriptions and keys for "opponent found" in the ranked queue and "your move" during a duel.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Mechanism | Standard Web Push (VAPID), library `web-push` | one path for Android Chrome, desktop browsers and iOS home-screen apps |
| Where subscriptions live | `push_subscriptions` in `evolution-types` | phase 2 has the duel server read them; a table two services use belongs to the shared schema |
| When the API sends | after the worker tick that issued the reservation commits | a push must never announce a pairing that was rolled back |
| Delivery guarantee | best effort, no retries | the duel waits only the lobby timeout; a late push is useless, and the in-app notice still covers players with the app open |
| Text language | stored per subscription (`en` / `es`), rendered by the API | the service worker has no access to the app's i18n bundle |
| Opt-in | a button on the tournament page and after entering a tournament | browsers grant permission only from a user gesture; asking on load is blocked or ignored |
| Native shell (Capacitor) | not covered | a WebView has no Web Push; native push is a separate project |

## Quick path

```
Player  taps "Notify me when it's my turn"      → client   Notification.requestPermission(), pushManager.subscribe(VAPID public key)
Client  PUT /me/push-subscriptions {endpoint, keys, locale} → API   upsert by endpoint (a device belongs to its latest user)
Worker  tick pairs A vs B, commits              → API      for each seat: send push to every subscription of that user
Push    service delivers                        → device   service worker shows "Your tournament duel is ready", tag = reservation
Player  taps the notification                   → client   focuses or opens /lightning/{id}; the page launches the reservation
Push    service answers 404 / 410               → API      subscription deleted
Client  sign-out                                → API      DELETE /me/push-subscriptions {endpoint}
```

## Data (evolution-types migration)

`push_subscriptions`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `varchar` FK → `users` | `ON DELETE CASCADE` |
| `endpoint` | `text` UNIQUE | the push service URL; identifies the browser install |
| `p256dh`, `auth` | `varchar` | the subscription's encryption keys |
| `locale` | `varchar(8)` | `en` or `es` |
| `created_at`, `last_used_at` | `timestamptz` | `last_used_at` set on every successful send |

Index on `user_id`. Upsert by `endpoint`: when another account signs in on the same browser, the row moves to it.

## Endpoints (API, bearer through `requireUser`)

| Method | Path | Notes |
|---|---|---|
| GET | `/push/public-key` | `{ publicKey }`, or `{ publicKey: null }` when push is not configured; public |
| PUT | `/me/push-subscriptions` | `{ endpoint, keys: { p256dh, auth }, locale }` → 204; endpoint must be `https` |
| DELETE | `/me/push-subscriptions` | `{ endpoint }` → 204; idempotent; only the caller's own row |

## Sending (API)

- Port `PushSender.send(subscription, payload, { ttlSeconds, urgency, topic })` → `sent` / `gone` / `failed`; the adapter builds the encrypted, VAPID-signed request with `web-push`'s `generateRequestDetails` and sends it with `fetch` (its `sendNotification` is tied to Node's `https` module).
- The pairing use cases (`PairLightningPlayers`, `PairSwissRound`) return the reservations they issued instead of a count; the tick collects `{ tournamentId, reservationId, userId }` per seat and, after its transaction commits, hands them to `NotifyLightningSummons`.
- `NotifyLightningSummons`: loads the subscriptions of each user, renders the text in the subscription's locale, sends with TTL = the tournament's lobby timeout, `Urgency: high` and a topic derived from the reservation, deletes subscriptions answered `gone`, logs `failed`. Sends run concurrently with a small cap and never block or fail the tick.
- Payload (JSON, under the 4 KB limit): `{ type: "lightning-summons", tournamentId, reservationId, title, body, url }`.
- Config: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` or `https:`). Without them push is off: no sends, `publicKey: null`.

## Client

- Service worker: the generated Workbox worker keeps its caching config and imports one static script (`workbox.importScripts`) with the `push` and `notificationclick` handlers. On `push`: if a visible window of the app exists, skip (the in-app notice is already there); otherwise show the notification with `tag = reservationId`. On click: focus an open window and navigate it to `url`, or open a new one.
- Opt-in control: "Notify me when it's my turn" on the tournament page and right after entering; shows the current state (on, off, blocked by the browser, unsupported). Subscribes with the API's public key and sends the locale.
- iOS outside the home screen (`navigator.standalone` false and no `PushManager`): the control explains that notifications need the app installed to the home screen.
- Sign-out deletes the subscription before dropping the token; a locale change re-sends it.
- The existing summons notice and title flashing stay for players with the app open. The browser notification there switches to `registration.showNotification` so it also works on Android.

## Phase 2 (duel server, not in this design's tasks)

The duel server reads `push_subscriptions` through `evolution-types`, uses the same VAPID keys, and sends `queue-match-found` and `your-move` payloads; the service worker gains those types. A frozen mobile tab will have dropped its duel socket, so "your move" depends on the reconnection window being longer than the time to come back.

## Failure modes

| Failure | Effect |
|---|---|
| Push not configured | no sends; the control is hidden |
| Permission denied | the control says so and how to re-enable it; nothing is sent |
| Push service slow or down | the push arrives late or never; TTL drops it after the lobby timeout |
| Subscription expired | 404 / 410 → row deleted; the client re-subscribes on its next visit |
| Worker crashes after commit, before sending | those pushes are lost; the pairing stands |
| Shared device | the latest signed-in account owns the endpoint; sign-out removes it |

## Not in scope

Native app push (Capacitor), marketing or broadcast notifications, per-type notification preferences, phase 2 sends.
