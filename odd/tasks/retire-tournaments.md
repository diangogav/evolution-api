# Feature: retire-tournaments

Engram mirror: topic `odd/retire-tournaments/tasks`, project `evolution-api`. Repository locator: `odd/tasks/retire-tournaments.md`.

## Objective

Remove the tournaments module from the API: the 11 `/tournaments` routes, the proxy to the upstream `evolution-tournaments` service, its configuration, tests and documentation.

## Problem and why

- The upstream tournaments service was experimental and never used in production; the user has no near plans for tournaments (2026-09-26).
- The 11 routes stay published and answer 500 while the upstream is off.
- `POST /tournaments/webhook` has no authentication and `UpdateRankingUseCase` is not idempotent. It is harmless only while the upstream is off.
- If tournaments return, the preferred path is to build them inside the API, not to restore this proxy.

## Scope

In: `src/modules/tournaments/**`, `src/server/routes/tournament-router.ts`, its mount in `src/server/server.ts`, the `tournaments` config block and its `TOURNAMENTS_*` variables, Swagger tags and tag groups only used by tournaments, ratchet test entries (`PROTECTED_OPERATIONS`, `UPSTREAM_DEPENDENT_OPERATIONS`), tournament tests, helpers left without callers, user-module code only used by tournaments, and the docs (`docs/domain/tournaments.md` removed; index, architecture, operations, domain index and README updated).

Out: the shared schema in `src/evolution-types` (tables such as `lightning_rankings`, `lightning_tournaments`, `tournaments` stay; they belong to the game server). `.env.example` and `.env.test` (the permission policy blocks agent edits; the user removes `TOURNAMENTS_*` lines by hand). The upstream repository.

## Constraints

- Strict TDD: enabled (`sdd-init/evolution-api`, Engram #1189). Runner `bun test`; lint `bun run lint`; type check `bun run build`. RED here is the ratchet and route tests updated to expect no tournament operations.
- Work-unit commits, Conventional Commits, no AI attribution. Never stage root `CLAUDE.md`, `.atl/` or `src/evolution-types`.
- Delivery: one PR to `main`; the diff is mostly deletions. Push, PR and merge are the user's decisions.
- Receipt-driven development is on; assess the commits before the PR.

## Checklist

- [x] 1 Remove the module, router, mount, config, Swagger tags and groups, ratchet entries, tests and orphaned helpers; `bun test`, lint and build green. (delegated; branch `chore/retire-tournaments`)
- [x] 2 Update docs: remove `docs/domain/tournaments.md`; update `docs/README.md`, `docs/domain/README.md`, `docs/architecture.md`, `docs/operations.md`, `README.md`. (delegated, same writer)
- [x] 3 Verify: no route under `/tournaments` in `/swagger/json`, no `TOURNAMENTS_` in `src`, native assessment, PR body.

## Progress and evidence

| Task | Route | Commit | Check | Notes |
|------|-------|--------|-------|-------|
| 1 remove code | delegated | RED 336ee27, GREEN 17cfcc9 | RED: 2 ratchet tests failed; GREEN: `bun test` 497 pass (522 before, 25 tournament tests removed), lint and tsc clean | also removed the orphaned `errorResponse` helper and the User `participantId` field, `updateParticipantId` and `findByParticipantId` (only tournaments used them; `update` never wrote that column, and it never reached a response); the shared `participant_id` column is untouched |
| 2 docs | delegated | 0820527 | structural readback | `docs/domain/tournaments.md` removed; index, architecture, operations and README updated |

## Next step

All tasks done; native review review-745b6e79991a25ea (high because auth test fakes changed, four lenses, consent granted) approved and acknowledged; its three doc notes fixed (stale `errorResponse` checklist step, change-history paragraph, rollback warning). PR pending. The user removes `TOURNAMENTS_*` from `.env.example` and `.env.test`, and from the deployed environment only once a rollback to an older version is no longer possible (older versions require them at startup; same for `SENDGRID_*`).
