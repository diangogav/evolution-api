# Auth consolidation (evolution-api audit step 3)
Objective: verify the bearer token once per request in one place and hand `userId` to handlers; admin checks go through `JwtAdminAuthorizer`. Branch `refactor/auth-consolidation`, single PR, runner `bun test`.

## Specs
- S1 One `requireUser` Elysia plugin (`src/server/auth/requireUser.ts`) verifies the token, rejects banned users and resolves `userId` for the handler. It replaces `banGuard` and every per-handler `jwt.decode(bearer)` in the emote-bar, loadout, me-cosmetics, missions, ticket, shop, event-run, player-reports and user routers.
- S2 Statuses do not change: no token → 401, invalid or expired token → 401, banned user → 403, request validation (422) still runs before auth, public and admin routes are not affected by `requireUser`.
- S3 Routers share one `JWT` instance instead of `new JWT(config.jwt)` per file.
- S4 The admin endpoints in `user-router.ts` (ban, unban, ban history, active ban) authorize through `JwtAdminAuthorizer` like the other admin routers: no token → 401, non-admin → 403. Their 403 text becomes the authorizer's ("Administrator role is required").
- S5 Tests cover S1–S4 through HTTP; `docs/architecture.md` and `AGENTS.md` describe the new auth wiring.
- Assumption: a validly signed token without an `id` answers 401 ("Token has no user id"); only this API signs tokens and all carry `id`.

## Tasks
| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S3, S5 | inline | done | 23055f7; RED: requireUser module missing; GREEN 8/8 plugin tests, suite 1191/0 |
| T2 | S4, S5 | inline | done | cea2d51; RED: 8/13 admin tests failed on texts only (401 leaked "Invalid token. JsonWebTokenError: jwt must be provided"); GREEN 13/13, suite 1204/0 |
| T3 | S5 (independent verification, risk item 2) | delegated verifier | done | PASS, no blockers: 272 differential requests baseline 35d4b12 vs cea2d51, 237 identical; the 35 differences are the declared ones (17 no-id tokens now 401, 18 on the ban endpoints per S4) |

## Log
- L1 (2026-11-02, user, verbatim): "si" — to: "¿Arranco por auth cuando mergees #157?", after the proposal "Auth en un solo lugar: una pieza que decodifique el token una vez y entregue `userId` y `role` a los handlers. Hoy se crea `new JWT` en 13 archivos, cada handler vuelve a decodificar el token y `user-router` revisa el rol a mano. Toca seguridad (riesgo 2), así que va con verificador independiente." Then "listo, mergeado".
- L2 (2026-11-02): probes on Elysia 1.4.30: a scoped `resolve` plugin runs after validation (422 before 401), injects a typed `userId`, stays inside a `.guard({}, ...)` callback, and works when reused by several routers with or without a plugin name. No client depends on the current 401/403 texts (grep of evolution-backoffice and evolution-card-game). Role stays with `JwtAdminAuthorizer`; `requireUser` exposes only `userId` because no non-admin handler reads the role.
- L3 (2026-11-02): T1 23055f7 — `requireUser` + `apiJwt` + shared `adminAuthorizer`; nine player routers migrated, `bandGuard.ts` deleted; player-reports now injects `requireUser` (test fake built with `createRequireUser`, adds forged → 401 and banned → 403). Route declaration: inline, no Writer trigger (one unit). Plugin is unnamed so a test instance with fake deps can never be deduplicated with the real one.
- L4 (2026-11-02): T2 cea2d51 — user-router ban endpoints call `adminAuthorizer.requireAdmin(bearer)`; the old 401 text for a missing token leaked the jsonwebtoken error. Docs: architecture auth section, moderation, cosmetics, README indexes, AGENTS.md, elysiajs and modules skills. Next: T3 independent verifier.
- L5 (2026-11-02): T3 verifier PASS on S1–S5 and the public-route invariant. Advisories, both pre-existing at baseline: (1) every admin route still puts the jsonwebtoken error, including the expected issuer, in its 401 text for an invalid token (`JWT.decode` builds it; only the missing-token case changed in T2); (2) docs/design/halloween-event-runs.md:146 still says `banGuard` (historical design record, left as is). Learned: `bun test` auto-loads `.env` besides `.env.test`, so production values are present unless `.env.test` overrides them.
- L6 (2026-11-02): PR #158 opened at the user's request ("si"). Diff 1239 lines raw, 695 ignoring whitespace (Biome reindentation from the guard shape); single PR under the 700-line rule.
