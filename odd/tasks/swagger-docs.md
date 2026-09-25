# Feature: swagger-docs

Engram mirror: topic `odd/swagger-docs/tasks`, project `evolution-api`. Repository locator: `odd/tasks/swagger-docs.md`.

## Objective

Turn `/swagger` into an exact, well-organized and branded reference of every endpoint, generated from the code and protected against drift by a test. Later work units add response schemas per module and a `docs/` knowledge base for what Swagger cannot express.

## Problem and why

- The document is titled "Evolution API - Tournaments" and describes only tournaments, although the API covers accounts, ranked play, cosmetics and moderation.
- Four tags used by routes are not declared (`Cosmetics Admin`, `Match Moderation`, `Ranked`, `Lightning Tournaments`), so they render without description or order.
- Eight routes have no `detail` (4 in `user-router`, 2 in `leaderboard-router`, 2 in `ban-list-router`).
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

- [ ] 1.1 RED: test that builds the app's routers with the shared Swagger config, reads the generated OpenAPI JSON, and asserts: every operation has at least one tag and every tag is declared; every operation has a `summary`; every operation behind `bearer()` declares `security: [{ bearerAuth: [] }]`; `info.title` is not tournament-specific; tag groups cover every declared tag exactly once. (delegated)
- [ ] 1.2 GREEN: extract the Swagger configuration to `src/server/swagger.ts`; declare every tag with a description; add tag groups (Account, Ranked, Tournaments, Cosmetics, Administration); set title, description, version, servers; add `security` to protected operations. (delegated)
- [ ] 1.3 GREEN: add `detail` (tags, summary, description) to the 8 routes that lack it. (delegated)
- [ ] 1.4 Scalar design: Evolution theme (custom CSS with the brand palette, dark by default), modern layout, logo and favicon, collapsed tags, persisted auth. Verified by loading `/swagger` locally. (delegated)
- [ ] 1.5 Gate: `bun test`, `bun run lint`, `bun run build`; runtime check of `/swagger` and `/swagger/json`. (inline)

### Work unit 2 — Response schemas (later)

- [ ] 2.x Per module: TypeBox schemas in `detail.responses`, validated against the current responses in tests; extend the ratchet test to require them.

### Work unit 3 — `docs/` knowledge base (later)

- [ ] 3.x Index, architecture, domain concepts (ranks, seasons, ledger, Elo, annulment, tiers), operations (env vars, migrations, scripts).

## Progress and evidence

| Task | Route | Commit | Focused check | Notes |
|------|-------|--------|---------------|-------|
| (none yet) | | | | |

## Next step

Implement work unit 1 through one bounded writer under Strict TDD.
