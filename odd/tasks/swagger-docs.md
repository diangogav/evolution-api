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

- [ ] F1 The protected-route detection in `openapi-document.test.ts` reads the handler source with a regex; a handler that delegates token reading to a controller or helper would slip through (it already missed tournament enroll/withdraw until they were fixed by hand). Replace it with an explicit, reviewed list of protected operations or a marker set by the auth wiring, so a new protected route without `security` fails the test. (delegated, with work unit 2)
- [ ] F2 Assert `info.version` is non-empty and the `servers` list matches production and local in the OpenAPI test. (delegated, with work unit 2)

### Work unit 2 — Response schemas (later)

- [ ] 2.x Per module: TypeBox schemas in `detail.responses`, validated against the current responses in tests; extend the ratchet test to require them.

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

Work unit 1 done and reviewed (receipt consumed); push and PR to main are the user's decision. Next: work unit 2 (response schemas per module).
