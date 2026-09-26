# Feature: swagger-docs

Engram mirror: topic `odd/swagger-docs/tasks`, project `evolution-api`. Repository locator: `odd/tasks/swagger-docs.md`.

## Objective

Turn `/swagger` into an exact, well-organized and branded reference of every endpoint, generated from the code and protected against drift by a test. Later work units add response schemas per module and a `docs/` knowledge base for what Swagger cannot express.

## Problem and why

- The document is titled "Evolution API - Tournaments" and describes only tournaments, although the API covers accounts, ranked play, cosmetics and moderation.
- Four tags used by routes are not declared (`Cosmetics Admin`, `Match Moderation`, `Ranked`, `Lightning Tournaments`), so they render without description or order.
- One route had no `detail` (`GET /users/:userId/ban/active`); the earlier count of eight came from a line-based grep and was wrong.
- Only one route declares its response schema; the rest rely on hand-written examples that drift silently.
- Protected routes do not declare the `bearerAuth` scheme, so the UI does not show which calls need a token.
- The UI uses Scalar's default look, unrelated to the Evolution brand.

## Scope

In (work unit 1, this branch): Swagger identity (title, description, version, servers, contact), every used tag declared with a description, tag groups by domain, `security` on every protected operation, `detail` on the 8 routes that lack it, Scalar theme and layout with the Evolution palette and logo, the Swagger configuration extracted to its own module, and a test that fails when any operation lacks a declared tag, a summary, or `security` while being protected.

Later work units (separate PRs): response schemas in `detail.responses` module by module (no runtime `response:` on legacy routes), then `docs/` pages (architecture, domain concepts, operations).

Out: changing any route behavior, paths, payloads or auth; runtime response validation on existing routes.

## Constraints

- Strict TDD: enabled. Source: `sdd-init/evolution-api` (Engram #1189). Runner: `bun test`; lint `bun run lint`; type check `bun run build`.
- Work-unit commits, Conventional Commits, tests with the behavior. Never stage root `CLAUDE.md`, `.atl/` or `src/evolution-types`.
- Brand palette from the public ranking site: accent `#883AEA` (rgb 136, 58, 234), accent dark `rgb(49, 10, 101)`, accent light `rgb(224, 204, 250)`, logo gradient `#bd24df` to `#2d6ade`, page background `#13151a`. Logo: `evolutionygo-web-ranking/public/logo.svg`.
- Delivery: `ask-on-risk`; forecast below 400 authored lines for work unit 1, single PR to `main`. Push, PR creation and merge are the user's decisions unless asked.
- Receipt-driven development is on for this clone; assess each work-unit commit.

## Checklist

### Work unit 1 — Swagger organization and design (`docs/swagger-organization`)

Focused command: `bun test tests/unit/server/swagger`. Runtime harness: start the API and load `/swagger` and `/swagger/json`. Rollback: revert the branch; routes are untouched.

- [x] 1.1 RED: test that builds the app's routers with the shared Swagger config, reads the generated OpenAPI JSON, and asserts: every operation has at least one tag and every tag is declared; every operation has a `summary`; every operation behind `bearer()` declares `security: [{ bearerAuth: [] }]`; `info.title` is not tournament-specific; tag groups cover every declared tag exactly once. (delegated)
- [x] 1.2 GREEN: extract the Swagger configuration to `src/server/swagger.ts`; declare every tag with a description; add tag groups (Account, Ranked, Tournaments, Cosmetics, Administration); set title, description, version, servers; add `security` to protected operations. (delegated)
- [x] 1.3 GREEN: add `detail` (tags, summary, description) to the 8 routes that lack it. (delegated)
- [x] 1.4 Scalar design: Evolution theme (custom CSS with the brand palette, dark by default), modern layout, logo and favicon, collapsed tags, persisted auth. Verified by loading `/swagger` locally. (delegated)
- [x] 1.5 Gate: `bun test`, `bun run lint`, `bun run build`; runtime check of `/swagger` and `/swagger/json`. (inline)

### Native review of work unit 1

Lineage review-802a77a5d2e5c5b2 (medium, `executable_change` TournamentController.ts; consent granted by the user; one reliability lens): approved and acknowledged with two advisories, carried as follow-ups:

- [x] F1 (landed in S0; residual risk: a new protected route that forgets both the list and `security` passes, so reviewers must check the list) The protected-route detection in `openapi-document.test.ts` reads the handler source with a regex; a handler that delegates token reading to a controller or helper would slip through (it already missed tournament enroll/withdraw until they were fixed by hand). Replace it with an explicit, reviewed list of protected operations or a marker set by the auth wiring, so a new protected route without `security` fails the test. (delegated, with work unit 2)
- [x] F2 (landed in S0) Assert `info.version` is non-empty and the `servers` list matches production and local in the OpenAPI test. (delegated, with work unit 2)

### Work unit 2 — Response schemas

Mapping (2026-09-26): 46 operations; only `GET /ranked-tiers` has a schema (runtime `response:`); about 17 have no `responses` at all; at least 9 examples contradict the code (login, validate-token, user matches, change-username, ban history, leaderboard, player-of-the-week, `GET /ban-lists`, tournament ranking). Schemas are written from the producer types, never from the old examples, and each slice replaces the wrong examples.

Findings that are behavior, not documentation:
- `server.ts` `onError` returns no body, so mapped errors reach clients as `text/plain` with the error message; validation errors are Elysia JSON (422). Documented as-is with a shared `ErrorSchema`; changing it is a contract change outside this work unit.
- (Resolved in #92) `UnauthorizedError` was not mapped in `onError`, so admin checks answered 500; it was replaced by `ForbiddenError` (403).
- Seven tournament routes depend on the upstream tournaments service (5 passthroughs, 1 typed cast, 1 ignoring the upstream body); they get permissive schemas marked as upstream-owned. `tournaments/infrastructure/swagger-schemas.ts` holds 8 unused schemas to check against the upstream before reuse.

Slices (each at most about 400 production lines; S1 and S2 both touch `user-router.ts`, merge in order):

- [x] S0 foundation (RED 19e477c, GREEN ca72932; tests 446 pass; 76 prod + 216 test lines; PROTECTED_OPERATIONS 25, PENDING 45, EMPTY_BODY 0; 422 body in production is `{type, on, found}`): `src/server/openapi/` helpers (`jsonOk`, `ErrorSchema` for text/plain errors, `ValidationErrorSchema` for 422, an `errors(...)` builder); ratchet test with an explicit `PROTECTED_OPERATIONS` list replacing the regex (F1), version and servers assertions (F2), and "every operation declares a 2xx schema" with a shrinking `PENDING_RESPONSE_SCHEMAS` allowlist; empty-body routes exempted explicitly. ~60 prod + 90 test.
- [x] S1 ranked and stats (7 ops; RED ffa97f9 GREEN b7bfd2d, wire-type fixes 2211aec/2431137 and a5a37df/9b36a76; bun test 464 pass; PENDING 45 -> 38; schemas validated against live responses of https://api.evolutionygo.com for 9 cases incl. a Master profile and full TCG, Edison and Global leaderboards; wire facts: `position` and player-of-the-week points/wins/losses are decimal strings from pg bigint, `winRate` a nullable float; wrong examples replaced for /stats, player-of-the-week, /ban-lists, /historical-stats, /users/{id}/stats; native review review-386ecf94a5c76423 approved and acknowledged, its two advisories fixed in 43241a8/247f1bf (signed weekly points) and eed1dd8 (ratchet checks every success example against its schema); follow-up commits assessed under budget): `UserStatsSchema` reusing `TierViewSchema` for `/users/:id/stats` and `/stats`, player of the week, ban lists, global stats, game ticket, ranked-tiers catalog in `detail`. ~220 prod + 120 test.
- [x] S2 account and auth (11 ops of `user-router` outside bans; delegated; RED 91891b6, GREEN 8c4035d; bun test 478 pass; lint and tsc clean; PENDING 38 -> 27, EMPTY_BODY 0 -> 2; +163/-116 src, +276/-12 tests; wrong examples replaced for register (missing `gamePassword`), login (flat `{id, token, username, mustUpgrade}`), forgot-password (message text, impossible 404 removed), validate-token (`{valid, userId}`, only 401/422), user matches (bare `Match[]`, no id, annulled included), change-username and change-account-password (empty 200), upgrade-password (`{id, token, username}`); live check against https://api.evolutionygo.com: matches for 4 players and username-availability pass; wire facts: match `date` is a zone-less TIMESTAMP sent as ISO, name lists are comma-split `simple-array`; native review review-b0fa59227d826b35 (high, auth hot path, 4 lenses, consent granted) approved and acknowledged with 5 non-blocking advisories, see S2 follow-ups).
  - [ ] S2-F1 (WARNING) no test proves the two empty-body routes send no body; both use cases return `Promise<void>`.
  - [ ] S2-F2 (SUGGESTION) `LoginSchema` duplicates the session-token shape of `PasswordUpgradeSchema`; objects are open (no `additionalProperties: false`).
  - [ ] S2-F3 (SUGGESTION) `AuthSchemas.test.ts`: duplicated repository stub and one misleading test name.
  - Email-send failures (forgot-password, reset and change account password) answer 500 and stay undocumented.
- [x] S3 cosmetics (10 ops served by `catalog`, `loadout` and `entitlements`, schemas colocated per module; delegated; RED 64a539d, GREEN 376c133; bun test 489 pass; lint and tsc clean; PENDING 27 -> 17, EMPTY_BODY 2; +241 src, +298/-10 tests; no prior examples existed, all derived from use-case output; no wire discrepancies (no bigint/numeric columns; `text[]` null normalized to `[]`); asset routes return JSON with signed R2 URLs, not binaries; a stale loadout reference yields empty `assets` and no `assetsExpiresAt`; live check against https://api.evolutionygo.com: catalog (18), 3 asset manifests and 2 public loadouts pass, unknown user 404; native review review-fcf0d9132c9a1072 (medium, one reliability lens, consent granted) approved and acknowledged with 2 suggestions; the catalog test now asserts a non-empty result).
  - [ ] S3-F1 (behavior, needs the user's decision) the cosmetics, loadout and admin-cosmetics routers do not use `banGuard`, so a banned user can still read and change cosmetics and loadout; only 401 is documented there.
  - [ ] S3-F2 (SUGGESTION) schema tests rely on open objects; same convention as S2-F2.
- [x] S4 moderation (4 user-ban ops + 2 annulment ops; delegated; RED 12c75b7, GREEN d326b67; bun test 500 pass; lint and tsc clean; PENDING 17 -> 11 (only tournaments left), EMPTY_BODY 2; +162/-62 src, +225/-6 tests; ban history example replaced (real entry `{id, userId, reason, bannedAt, expiresAt, bannedBy, createdAt, updatedAt}`), ban and unban get `{success: true}`, active ban is nullable; annulment and reversal return per-game outcomes (`not-found`, `conflict`, `partial` are 200 values) with in-memory counters; wire fact: `expiresAt` is typed optional but travels as `null` for permanent bans; the documented 404s were removed because they cannot happen; no live check (all 6 need an admin token and would mutate data); native review review-18e98b86ff7107cb (medium, one reliability lens, consent granted) approved and acknowledged with 1 warning and 1 suggestion).
  - [ ] S4-F1 (behavior, needs the user's decision) banning an unknown user id answers 500: `UserBanPostgresRepository` uses `findOneOrFail` and `mapDomainErrorStatus` does not map TypeORM's `EntityNotFoundError`. Unbanning a user with no active ban answers 200. The review warning about the dropped 404 is answered by this trace.
  - [ ] S4-F2 (SUGGESTION) the `BanActionSchema` test builds `{success: true}` itself instead of reading the router response.
  - Ban routes sit outside `banGuard` by design (admin endpoints); annulment routes use `JwtAdminAuthorizer`.
- [x] S5 tournaments (11 ops; delegated; RED 6096bad and 71e08b2, GREEN 44e27bb; bun test 522 pass; lint and tsc clean; PENDING 11 -> 0, EMPTY_BODY 2; +330/-213 src, +652/-3 tests, single PR with size:exception by the user's decision; local: enroll, withdraw and webhook `{success: true}`, DELETE result `{message}`, ranking from TypeORM integer columns (not raw SQL, no string coercion); passthroughs derived from the upstream source github.com/diangogav/evolution-tournaments@c19746d (list, create, bracket view keyed by slot, generate-full and record-result return only `{message}`, entries array with `participantName`), open objects, upstream-owned wording; every upstream-dependent route documents 500 "Upstream tournaments service unavailable" via the new `errorResponse(description)` helper, confirmed live while the upstream was off (500 text/plain "Unable to connect"); live ranking `200 []` matches; old examples for list, create, bracket, generate, record-result and entries were fictional; native review review-e1248e129a40a5fb (medium, one reliability lens, consent granted) approved and acknowledged with 1 warning and 3 suggestions).
  - [ ] S5-F1 (behavior, needs the user's decision) the webhook has no shared secret or signature check.
  - [ ] S5-F2 (behavior) upstream 201 answers are relayed as 200; upstream 404s surface as 500 because gateway errors are plain `Error`.
  - [ ] S5-F3 (cleanup) the DELETE result route duplicates `TournamentGateway.annulMatchResult` inline; 7 schemas in `swagger-schemas.ts` are stale or unused.
- [ ] WU2-F1 route-level response tests: several schema tests check a literal instead of the handler output (S2-F1 empty bodies, S4-F2 ban action, S5 enroll/withdraw/webhook and DELETE result); the S5 create-tournament tests do not assert the outgoing mapping and one rejection test names the wrong reason. Mount the routes with fakes and assert the real bodies.

### Work unit 3 — `docs/` knowledge base (later)

Pages are written for a developer joining the project, from the code (never from memory or old docs), in English, following the `cognitive-doc-design` skill; each claim points to the file that proves it. No secrets or credential values. Passive documentation: structural readback, no native review unless assessment says otherwise. One PR per slice.

- [x] 3.1 Index and architecture (`docs/README.md`, `docs/architecture.md`; branch `docs/knowledge-base-01-architecture`, delegated): hexagonal module layout and dependency rule, routers as composition root, the two DataSources and the shared `src/evolution-types` package, error mapping and bodies, auth (`bearer`, `banGuard`, `JwtAdminAuthorizer`), Swagger and the OpenAPI ratchet, testing conventions; README link. Done: b51ccab (index and architecture), d24c1c2 (README link), b25fea9 (internal task references removed); 199 lines; every cited path, env var name and version checked against the code; assessment passive, no review due. Page facts worth knowing: the SendGrid sender exists but only Resend is wired; `tournament-router.ts` delegates to `TournamentController`, which reads the token itself.
- [ ] 3.2 Domain concepts (`docs/domain/`): seasons and ranks, points ledger, Elo ratings, match annulment and reversal, ranked tiers (link the existing guide), bans, cosmetics and entitlements, tournaments and the upstream service.
- [ ] 3.3 Operations (`docs/operations.md`): environment variables (names and purpose only), running locally, migrations per DataSource, seeds and scripts, deployment notes.

## Progress and evidence

| Task | Route | Commit | Focused check | Notes |
|------|-------|--------|---------------|-------|
| 1.1 ratchet test | delegated | 1c5058b | 6 of 7 failed before GREEN | mounts the real routers; protected = handler reads bearer or Authorization |
| 1.2 config, tags, groups, servers, security | delegated | de48b3d | | `src/server/swagger.ts`; 14 tags in 5 groups; "Players & Participants" dropped (unused); security also on tournament enroll/withdraw |
| 1.3 missing detail | delegated | 25630fb | 7 pass | only `ban/active` lacked it |
| 1.4 Scalar design | delegated | 42ad20c, 84b55b5, 40b321e | 14 pass | theme in `swagger-theme.ts`; Scalar pinned 1.72.1; developer tools, AI agent and MCP promos hidden by config; persistAuth on; accent via `--scalar-link-color` and sidebar active variables |
| 1.5 gate | inline | tree 40b321e | `bun test` 434 pass / 0 fail; lint clean (1 pre-existing info); tsc clean. Runtime: API on the branch against dev, `/swagger/json` = Evolution API 1.0.50, 46 operations, 25 secured, 5 tag groups; `/swagger` screenshot verified (branding, groups, no promo UI, violet accent) | authored 540 lines in src/tests (455 + 85) |

## Next step

Work unit 1 merged (#91). Work unit 2: S0 (#93) and S1 (#94) merged; S2 merged (#95); S3 merged (#96); S4 merged (#97); S5 merged (#98); work unit 2 complete except its follow-ups. Work unit 3: 3.1 done on `docs/knowledge-base-01-architecture`, PR pending; next 3.2 domain concepts. After it merges, work unit 2 is complete except its follow-ups; next is work unit 3 (`docs/` pages).
