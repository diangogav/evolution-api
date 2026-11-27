---
name: "device_sessions"
description: "Let players see the devices signed in to their account and sign any of them out, cutting the revoked JWT immediately"
created_at: "2026-11-27T12:00:00Z"

created_by:
  tool: "Claude Code"
  model:
    name: "Claude Opus"
    version: "5.5"
    reasoning_effort: "low"

implemented_by:
  tool: "Claude Code"
  model:
    name: "Claude Opus"
    version: "5.5"
    reasoning_effort: "low"

last_implementation_at: "2026-11-27T17:00:00Z"
has_completed_all_phases: "true"
---

# Device sessions

## 🎯 Goal

Players can list the devices signed in to their account and sign out one of them, or all the others. A revoked session stops working at once, without shortening the 24h JWT that external clients (MDPro4) rely on.

## 👀 Context

Spans two repositories: each phase ships one PR in `evolution-api` and one in `evolution-card-game`.

- Conventions: [`AGENTS.md`](../../../AGENTS.md), [`docs/architecture.md`](../../../docs/architecture.md) (auth, error map, OpenAPI ratchet checklist), [`.agent/skills/evolution-api-modules/SKILL.md`](../../../.agent/skills/evolution-api-modules/SKILL.md), [`.agent/skills/elysiajs/SKILL.md`](../../../.agent/skills/elysiajs/SKILL.md).
- Refresh tokens: one family per sign-in, rotated on every renewal.
  - [`src/modules/auth/domain/RefreshToken.ts`](../../../src/modules/auth/domain/RefreshToken.ts): port, `revokeFamily`, `revokeAllForUser`.
  - [`src/modules/auth/infrastructure/RefreshTokenPostgresRepository.ts`](../../../src/modules/auth/infrastructure/RefreshTokenPostgresRepository.ts): raw SQL.
  - [`src/migrations/1783200000000-create-refresh-tokens.ts`](../../../src/migrations/1783200000000-create-refresh-tokens.ts): table without device data.
- Session issuing:
  - [`src/modules/auth/application/SessionTokens.ts`](../../../src/modules/auth/application/SessionTokens.ts): `issue`, `attach`.
  - [`src/modules/auth/application/RefreshSession.ts`](../../../src/modules/auth/application/RefreshSession.ts): signs the renewed JWT.
  - [`src/modules/auth/application/EndSession.ts`](../../../src/modules/auth/application/EndSession.ts): logout.
  - `attach` call sites: [`src/server/routes/user-router.ts`](../../../src/server/routes/user-router.ts) (register, login, upgrade, reset) and [`src/server/routes/discord-auth-router.ts`](../../../src/server/routes/discord-auth-router.ts).
  - JWTs are signed in `UserAuth`, `ExchangeLoginCode` and `RefreshSession`, before the family id exists. The `sid` claim forces `attach` to own the final JWT.
- Guard: [`src/server/auth/requireUser.ts`](../../../src/server/auth/requireUser.ts) already queries active bans on every request, so one extra Redis read is cheap.
- Redis adapters to copy: [`src/modules/auth/infrastructure/BunRedisLoginCodeStore.ts`](../../../src/modules/auth/infrastructure/BunRedisLoginCodeStore.ts), [`src/shared/redis/redisClient.ts`](../../../src/shared/redis/redisClient.ts).
- Session revocation on password/email change: [`src/modules/user/domain/SessionRevoker.ts`](../../../src/modules/user/domain/SessionRevoker.ts).
- Tests:
  - [`tests/unit/modules/auth/InMemoryRefreshTokens.ts`](../../../tests/unit/modules/auth/InMemoryRefreshTokens.ts)
  - [`tests/unit/modules/auth/application/RefreshSession.test.ts`](../../../tests/unit/modules/auth/application/RefreshSession.test.ts)
  - [`tests/unit/server/routes/session-router.test.ts`](../../../tests/unit/server/routes/session-router.test.ts)
  - [`tests/unit/server/swagger/openapi-document.test.ts`](../../../tests/unit/server/swagger/openapi-document.test.ts)
- Client (`evolution-card-game`, load its `svelte-5` skill before editing `.svelte` files):
  - `src/features/auth/state/sessionStore.svelte.ts`: session and refresh token in localStorage.
  - `src/features/auth/infrastructure/HttpAuthApi.ts`: HTTP adapter to mirror.
  - `src/config/authApi.ts`: routes.
  - `src/features/profile/ui/Profile.svelte`: "account tools" block, next to `DiscordLinkSection.svelte` and `EmailChangeSection.svelte`.
  - i18n: paraglide messages under `src/shared/i18n`.
- Out of scope:
  - Storing the IP address.
  - Cross-device duel reconnection (separate plan).
  - JWTs issued before this change carry no `sid`, so they cannot be revoked and expire on their own within 24h.
  - MDPro4 does not renew, so its sessions show `lastUsedAt` equal to the sign-in time.

## 🪜 Phases

### Phase 1: List my devices

**Description:** A player opens the profile and sees every active sign-in with its browser, OS, sign-in time and last use, with the current device marked. Read only.

**Public contracts**

- Database schema: migration `1783600000000-session-devices` on `refresh_tokens` adds:
  - `user_agent character varying(512) NULL`
  - `signed_in_at TIMESTAMP WITH TIME ZONE NOT NULL`: the family's sign-in time, copied to every successor, backfilled from each family's oldest row. Expired rows are deleted, so the oldest remaining row is not a reliable sign-in time. Last use needs no column: it is the newest token's `created_at`.
- Domain:
  - `StoredRefreshToken` and `RefreshTokenRecord` gain `userAgent: string | null` and `signedInAt: Date`.
  - `RefreshTokenRepository.listActiveForUser(userId: string, now: Date): Promise<ActiveSession[]>` returns one entry per family that is not revoked or expired, taken from its newest token.
  - `ActiveSession = { familyId, userAgent, signedInAt, lastUsedAt }`, where `lastUsedAt` is the newest token's creation.
  - `describeDevice(userAgent: string | null): { browser: string | null; os: string | null }` is a pure function.
- Application:
  - `SessionTokens` takes the JWT signer; `issue(input)` gains `userAgent?: string | null` and replaces `familyId` with `renewing?: { familyId, signedInAt }`.
  - `JWT.reissue(token, claims)`: signs a fresh token with the claims of a valid one plus `claims`.
  - `SessionTokens.attach(session, { now, userAgent })`:
    - picks the family id first;
    - signs the session JWT with the extra claim `sid: familyId`, keeping the other claims;
    - returns `session & { token, refreshToken }`.
  - `RefreshSession.run({ refreshToken, now, userAgent })`:
    - the renewed JWT carries `sid`;
    - the successor token takes the request's `userAgent` (or keeps the stored one when absent) and keeps `signedInAt`.
  - `ListMySessions.run({ userId, currentSid, now }): Promise<MySession[]>`:
    - `MySession = { id, browser, os, signedInAt, lastUsedAt, current }`;
    - `id` is the family id;
    - sorted current first, then by last use.
- Guard: `requireUser` also resolves `sid: string | null` from the token.
- Endpoint: `GET /api/v1/me/sessions` answers 200 with `MySession[]` (TypeBox schema) and 401 without a valid token.
- Client:
  - `IAuthApi.listSessions(): Promise<MySession[]>` implemented in `HttpAuthApi`.
  - `ConnectedDevicesSection.svelte` in the profile account tools.
- UI copies (es / en):
  - `profile_devices_title`: "Dispositivos conectados" / "Signed-in devices"
  - `profile_devices_desc`: "Todos los dispositivos donde tu cuenta está abierta ahora." / "Every device where your account is open right now."
  - `profile_devices_loading`: "Cargando tus dispositivos…" / "Loading your devices…"
  - `profile_devices_retry`: "Reintentar" / "Retry"
  - `profile_devices_current`: "Este dispositivo" / "This device"
  - `profile_devices_last_used`: "Último uso: {date}" / "Last used: {date}"
  - `profile_devices_unknown`: "Dispositivo desconocido" / "Unknown device"
  - `profile_devices_error`: "No se pudieron cargar los dispositivos" / "Could not load your devices"
- Test suites:
  - `tests/unit/modules/auth/domain/describeDevice.test.ts`:
    - Chrome on Android
    - Safari on iOS
    - Firefox on Windows
    - Capacitor Android app
    - MDPro or unknown agent gives nulls
    - null agent gives nulls
  - `tests/unit/modules/auth/application/ListMySessions.test.ts`:
    - lists one entry per active sign-in
    - excludes revoked and expired sign-ins
    - marks the session whose family is `currentSid`
    - marks none as current when `currentSid` is null
    - uses the newest token's last use of each family
  - `tests/unit/modules/auth/application/RefreshSession.test.ts`, new cases:
    - the renewed JWT carries `sid`
    - the successor keeps the sign-in time and takes the new user agent
    - the successor keeps the stored user agent when the request sends none
  - `tests/unit/modules/auth/application/RefreshSession.test.ts` (its `SessionTokens` block):
    - `attach` signs a JWT whose `sid` equals the stored family id
    - `attach` stores the user agent and sign-in time
    - the stored user agent is bounded and an empty one is null
  - `tests/unit/server/auth/requireUser.test.ts`: hands `sid`, and null for a token without one.
  - `tests/unit/server/routes/me-sessions-router.test.ts`:
    - 200 with the schema
    - 200 with an empty list
    - 401 without a token
  - `tests/unit/server/swagger/openapi-document.test.ts` covers the new route.
  - Client `ConnectedDevicesSection` tests:
    - renders the list with the current device marked
    - shows the unknown device label
    - shows the error state and retries
  - Client `HttpAuthApi` tests: GET with the bearer token, malformed entries dropped, a non-list body read as empty.

**To-do actions**

- [x] `evolution-api`: add the migration and update the Postgres repository (`INSERT` with the new columns, `listActiveForUser`).
- [x] `evolution-api`: update `InMemoryRefreshTokens` to the new port.
- [x] `evolution-api`: add `describeDevice` with its tests.
- [x] `evolution-api`: make `SessionTokens.attach` own the final JWT with `sid` and the user agent.
- [x] `evolution-api`: pass the request `User-Agent` header from every `attach` call site and from `/auth/refresh`.
- [x] `evolution-api`: carry the user agent and `lastUsedAt` through `RefreshSession`.
- [x] `evolution-api`: resolve `sid` in `requireUser`.
- [x] `evolution-api`: add `ListMySessions`, the `me-sessions-router` with its TypeBox schema and OpenAPI detail, and mount it in `src/server/server.ts`.
- [x] `evolution-api`: write the tests listed above.
- [x] `evolution-card-game`: add `listSessions` to `IAuthApi`/`HttpAuthApi` and the route in `src/config/authApi.ts`.
- [x] `evolution-card-game`: add `ConnectedDevicesSection.svelte` to the profile account tools (signed-in only), the i18n copies and the component tests.
- [x] Verify the changes in terms of typechecking, linting and tests using the project's verification command (look it up in the AGENTS.md file or the project configuration). Fix issues if any.
  - `evolution-api`: `bun test`, `bun run lint`, `bun run build`.
  - `evolution-card-game`: touched-area tests (`npx vitest run <paths>`), `npm run lint`, `npm run build`.
- [x] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

### Phase 2: Sign devices out, effective immediately

**Description:** From the same section the player signs out one device, or every device except the current one. The revoked device can no longer renew, and its current JWT is refused at once.

**Public contracts**

- Redis: key `session:revoked:<familyId>` with a TTL equal to the JWT lifetime (`config.jwt.expiresIn`, 24h by default).
- Domain:
  - Port `RevokedSessions { markRevoked(familyIds: string[]): Promise<void>; isRevoked(familyId: string): Promise<boolean> }` in the `auth` module.
  - Adapter `BunRedisRevokedSessions`.
  - `RefreshTokenRepository.revokeAllForUser(userId, now)` now returns the revoked family ids, so callers can mark them in Redis.
  - `RevokeSessions` (application) is the single way to end sign-ins: `revokeFamily`, `revokeAllForUser` and `revokeAllForUserExcept` revoke the refresh tokens and mark the families. It is the `SessionRevoker` the user use cases receive, and `RefreshSession` (reuse, ban) and `EndSession` use it too.
  - New `RefreshTokenRepository.revokeAllForUserExcept(userId, keepFamilyId, now): Promise<string[]>`.
- Application:
  - `RevokeMySession.run({ userId, sessionId, now }): Promise<void>`:
    - throws `NotFoundError` when the family does not belong to the user or is not active;
    - revokes the family and marks it revoked.
  - `RevokeMyOtherSessions.run({ userId, currentSid, now }): Promise<void>`:
    - revokes every active family of the user except `currentSid`;
    - when `currentSid` is null, it revokes every family.
  - `EndSession`, `RefreshSession` and `SessionRevoker` (password reset, password change, upgrade, email change) also mark the families they revoke, so those changes cut the JWTs at once.
- Guard: `requireUser` throws `AuthenticationError("Session revoked")` when the token's `sid` is revoked. A token without `sid` passes.
- Endpoints:
  - `DELETE /api/v1/me/sessions/:id`: 204, 404, 401.
  - `DELETE /api/v1/me/sessions`: signs out every other device; 204, 401.
- Client:
  - `IAuthApi.revokeSession(id: string): Promise<void>`.
  - `IAuthApi.revokeOtherSessions(): Promise<void>`.
  - A per-row button and a section button, both behind a confirmation.
  - Revoking the current device runs the existing local sign-out.
  - A 401 with an expired session already sends the user to sign-in through `sessionStore`.
- UI copies (es / en):
  - `profile_devices_sign_out`: "Cerrar sesión" / "Sign out"
  - `profile_devices_sign_out_others`: "Cerrar las demás sesiones" / "Sign out all other devices"
  - `profile_devices_confirm_one`: "¿Cerrar la sesión en este dispositivo?" / "Sign out this device?"
  - `profile_devices_confirm_others`: "¿Cerrar la sesión en todos los demás dispositivos?" / "Sign out every other device?"
  - `profile_devices_signed_out`: "Sesión cerrada" / "Signed out"
  - `profile_devices_confirm`: "Sí, cerrar sesión" / "Yes, sign out"
  - `profile_devices_cancel`: "Cancelar" / "Cancel"
  - `profile_devices_action_error`: "No funcionó. Inténtalo de nuevo en un momento." / "That did not work. Try again in a moment."
- Test suites:
  - `tests/unit/modules/auth/application/RevokeSessions.test.ts` (one file for `RevokeSessions`, `RevokeMySession` and `RevokeMyOtherSessions`):
    - `RevokeSessions` marks every ended sign-in once and leaves other users alone
  - `RevokeMySession`:
    - revokes the user's own session and marks it revoked
    - another user's session throws `NotFoundError`
    - an unknown or already revoked session throws `NotFoundError`
  - `RevokeMyOtherSessions`:
    - keeps the current session
    - revokes and marks all others
    - a null `currentSid` revokes everything
    - is idempotent with no other sessions
  - `tests/unit/modules/auth/application/RefreshSession.test.ts`: logout, reuse and ban mark the family revoked.
  - `tests/unit/server/auth/requireUser.test.ts`:
    - a revoked `sid` answers 401
    - an active `sid` passes
    - a token without `sid` passes
  - `tests/unit/server/routes/me-sessions-router.test.ts`, new cases:
    - `DELETE /:id` answers 204, 404 and 401
    - `DELETE /` answers 204 and 401
  - `tests/unit/server/swagger/openapi-document.test.ts` covers the new routes.
  - Client `ConnectedDevicesSection` tests:
    - asks for confirmation before revoking
    - refreshes the list after revoking
    - revoking the current device signs out locally

**To-do actions**

- [x] `evolution-api`: add the `RevokedSessions` port and its Bun Redis adapter.
- [x] `evolution-api`: change `revokeAllForUser` to return family ids and add `revokeAllForUserExcept` (Postgres and in-memory).
- [x] `evolution-api`: add `RevokeMySession` and `RevokeMyOtherSessions`.
- [x] `evolution-api`: make `EndSession` and `SessionRevoker` mark revoked families.
- [x] `evolution-api`: check the revoked `sid` in `requireUser`.
- [x] `evolution-api`: add both `DELETE` routes with OpenAPI detail.
- [x] `evolution-api`: write the tests listed above.
- [x] `evolution-card-game`: add the two API methods, the buttons with confirmation, the i18n copies and the component tests.
- [x] Verify the changes in terms of typechecking, linting and tests using the project's verification command (look it up in the AGENTS.md file or the project configuration). Fix issues if any.
  - `evolution-api`: `bun test`, `bun run lint`, `bun run build`.
  - `evolution-card-game`: touched-area tests (`npx vitest run <paths>`), `npm run lint`, `npm run build`.
- [x] STOP. Present the changes to the user for review and suggest commit messages (or pull request titles, when the phases are implemented through pull requests). Do NOT proceed to the next phase until the user explicitly asks.

## ⏭️ Next step

All phases are complete. Next: deploy both phases and plan cross-device duel reconnection.

Devices on the map, intruders shown the door by [Codely](https://codely.com) 🚪 📱 🐢 💨
