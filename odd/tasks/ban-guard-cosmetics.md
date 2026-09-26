# Feature: ban-guard-cosmetics

Engram mirror: topic `odd/ban-guard-cosmetics/tasks`, project `evolution-api`. Repository locator: `odd/tasks/ban-guard-cosmetics.md`.

## Objective

Banned users cannot use the authenticated cosmetics and loadout routes: all four answer 403.

## Problem and why

`me-cosmetics-router.ts` and `loadout-router.ts` only decode the bearer token, so a banned user can still list their cosmetics, fetch asset manifests, read and change their loadout. The account and ticket routes already reject banned users through `banGuard` (401 missing or invalid token, 403 banned).

## Scope

In: `GET /me/cosmetics/`, `GET /me/cosmetics/{id}/assets`, `GET /me/loadout/`, `PUT /me/loadout/` behind `banGuard` (user decision 2026-09-26: all four, not only the loadout change); their Swagger error responses gain 403; tests; docs (`docs/architecture.md` auth section, `docs/domain/moderation.md`, `docs/domain/cosmetics.md`).

Out: public routes (catalog, public asset manifests, public loadout by username), admin cosmetics routes (`JwtAdminAuthorizer`), any change to `banGuard` itself.

## Constraints

- Strict TDD: enabled (`sdd-init/evolution-api`, Engram #1189). Runner `bun test`; lint `bun run lint`; type check `bun run build`. RED: a banned user's request to each route answers 403.
- Work-unit commits, Conventional Commits, no AI attribution. Never stage root `CLAUDE.md`, `.atl/`, `src/evolution-types`, or `odd/tasks/swagger-docs.md` (it has an unrelated pending edit).
- Delivery: one PR to `main`. Push, PR and merge are the user's decisions. Receipt-driven development on; assess before the PR.

## Checklist

- [x] 1 RED then GREEN: route tests proving 403 for a banned user and unchanged behavior for others on the four routes; wire `banGuard` like `ticket-router.ts`; add 403 to their documented errors. (delegated; branch `fix/ban-guard-cosmetics`)
- [x] 2 Docs: auth section, moderation and cosmetics pages state that these routes reject banned users. (delegated, same writer)
- [x] 3 Verify, assess, PR body.

## Progress and evidence

| Task | Route | Commit | Check | Notes |
|------|-------|--------|-------|-------|
| 1 guard and tests | delegated | eef620d | RED: the 4 "403 when banned" tests failed (got 200) with the routers at their previous state; GREEN: 12/12 focused, `bun test` 509 pass, lint and tsc clean | no production seam: tests stub the Postgres repositories with `spyOn` on their prototypes, because `mock.module` leaked across files in bun's shared module registry; `bandGuard.ts` unchanged; 17 lines changed ignoring indentation |
| 2 docs | delegated | f2f49d6 | structural readback | architecture auth section and moderation page updated; the cosmetics page only mentions the public loadout route, which correctly stays unguarded |
| 3 review | inline + delegated | 1dd0d2d | native review review-e54d56691fbe28b7 (medium, reliability lens, consent granted) approved and acknowledged; its three test suggestions added: no save on a banned PUT, 401 for malformed and badly signed tokens on all four routes, body checks on the 200 cases; focused 20 pass, `bun test` 517 pass; follow-up assessed under budget | |

## Next step

All tasks done; PR pending.
