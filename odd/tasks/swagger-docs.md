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

- [ ] F1 (lands in S0) The protected-route detection in `openapi-document.test.ts` reads the handler source with a regex; a handler that delegates token reading to a controller or helper would slip through (it already missed tournament enroll/withdraw until they were fixed by hand). Replace it with an explicit, reviewed list of protected operations or a marker set by the auth wiring, so a new protected route without `security` fails the test. (delegated, with work unit 2)
- [ ] F2 (lands in S0) Assert `info.version` is non-empty and the `servers` list matches production and local in the OpenAPI test. (delegated, with work unit 2)

### Work unit 2 — Response schemas

Mapping (2026-09-26): 46 operations; only `GET /ranked-tiers` has a schema (runtime `response:`); about 17 have no `responses` at all; at least 9 examples contradict the code (login, validate-token, user matches, change-username, ban history, leaderboard, player-of-the-week, `GET /ban-lists`, tournament ranking). Schemas are written from the producer types, never from the old examples, and each slice replaces the wrong examples.

Findings that are behavior, not documentation:
- `server.ts` `onError` returns no body, so mapped errors reach clients as `text/plain` with the error message; validation errors are Elysia JSON (422). Documented as-is with a shared `ErrorSchema`; changing it is a contract change outside this work unit.
- `UnauthorizedError` is not mapped in `onError`, so admin checks in `user-router` and `TournamentController` answer 500 while the docs say 401. Candidate fix pending the user's decision.
- Seven tournament routes depend on the upstream tournaments service (5 passthroughs, 1 typed cast, 1 ignoring the upstream body); they get permissive schemas marked as upstream-owned. `tournaments/infrastructure/swagger-schemas.ts` holds 8 unused schemas to check against the upstream before reuse.

Slices (each at most about 400 production lines; S1 and S2 both touch `user-router.ts`, merge in order):

- [ ] S0 foundation: `src/server/openapi/` helpers (`jsonOk`, `ErrorSchema` for text/plain errors, `ValidationErrorSchema` for 422, an `errors(...)` builder); ratchet test with an explicit `PROTECTED_OPERATIONS` list replacing the regex (F1), version and servers assertions (F2), and "every operation declares a 2xx schema" with a shrinking `PENDING_RESPONSE_SCHEMAS` allowlist; empty-body routes exempted explicitly. ~60 prod + 90 test.
- [ ] S1 ranked and stats (8 ops): `UserStatsSchema` reusing `TierViewSchema` for `/users/:id/stats` and `/stats`, player of the week, ban lists, global stats, game ticket, ranked-tiers catalog in `detail`. ~220 prod + 120 test.
- [ ] S2 account and auth (12 ops of `user-router` outside bans). ~260 prod + 120 test.
- [ ] S3 cosmetics (10 ops, 6 DTO schemas). ~250 prod + 120 test.
- [ ] S4 moderation (2 annulment ops + 4 user-ban ops). ~170 prod + 80 test.
- [ ] S5 tournaments (5 local shapes + upstream-owned proxies). ~200 prod + 80 test.

### Work unit 3 — `docs/` knowledge base (later)

- [ ] 3.x Index, architecture, domain concepts (ranks, seasons, ledger, Elo, annulment, tiers), operations (env vars, migrations, scripts).

## Progress and evidence

| Task | Route | Commit | Focused check | Notes |
|------|-------|--------|---------------|-------|
| 1.1 ratchet test | delegated | 1c5058b | 6 of 7 failed before GREEN | mounts the real routers; protected = handler reads bearer or Authorization |
| 1.2 config, tags, groups, servers, security | delegated | de48b3d | | `src/server/swagger.ts`; 14 tags in 5 groups; "Players & Participants" dropped (unused); security also on tournament enroll/withdraw |
| 1.3 missing detail | delegated | 25630fb | 7 pass | only `ban/active` lacked it |
| 1.4 Scalar design | delegated | 42ad20c, 84b55b5, 40b321e | 14 pass | theme in `swagger-theme.ts`; Scalar pinned 1.72.1; developer tools, AI agent and MCP promos hidden by config; persistAuth on; accent via `--scalar-link-color` and sidebar active variables |
| 1.5 gate | inline | tree 40b321e | `bun test` 434 pass / 0 fail; lint clean (1 pre-existing info); tsc clean. Runtime: API on the branch against dev, `/swagger/json` = Evolution API 1.0.50, 46 operations, 25 secured, 5 tag groups; `/swagger` screenshot verified (branding, groups, no promo UI, violet accent) | authored 540 lines in src/tests (455 + 85) |

## Next step

Work unit 1 merged (#91). Work unit 2 in progress: S0 foundation on `docs/swagger-response-schemas-00-foundation`.
