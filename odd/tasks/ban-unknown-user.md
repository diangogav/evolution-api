# Feature: ban-unknown-user

Engram mirror: topic `odd/ban-unknown-user/tasks`, project `evolution-api`. Repository locator: `odd/tasks/ban-unknown-user.md`.

## Objective

`POST /users/{userId}/ban` answers 404 for an unknown user id and works when the user is already banned.

## Problem and why

- `UserBanPostgresRepository.banUser` loads the user with `findOneOrFail`. For an unknown id it throws TypeORM's `EntityNotFoundError`, which `mapDomainErrorStatus` does not map, so the admin gets a 500.
- Banning soft-deletes the user (`deletedAt`). `findOneOrFail` skips soft-deleted rows, so re-banning an already banned user also fails with 500, after `finishActiveBan` has already closed the current ban. The user ends with no active ban while still soft-deleted.

## Scope

In: `UserBanUser` checks that the user exists (including soft-deleted) before any write and throws `NotFoundError` (404); `banUser` loads the user including soft-deleted rows; the ban route documents 404; tests; docs (`docs/domain/moderation.md`, `docs/architecture.md` where they describe the 500).

Out: unban of an unknown user (stays 200, no-op; not requested); transactions around ban writes; `banGuard`; `src/evolution-types`.

## Constraints

- Strict TDD: enabled (`sdd-init/evolution-api`, Engram #1189). Runner `bun test`; lint `bun run lint`; type check `bun run build`.
- Work-unit commits, Conventional Commits, no AI attribution. Never stage root `CLAUDE.md`, `.atl/`, `src/evolution-types`, or `odd/tasks/swagger-docs.md`.
- One PR to `main`; push, PR and merge are the user's decisions. RDD on; assess before the PR.

## Checklist

- [x] 1 RED then GREEN: unknown user → `NotFoundError` with no write (`finishActiveBan` and `banUser` not called); already soft-deleted user → ban created; route documents 404. (delegated; branch `fix/ban-unknown-user`)
- [x] 2 Docs updated. (same writer)
- [ ] 3 Verify, assess, PR body.

## Progress and evidence

| Task | Route | Commit | Check | Notes |
|------|-------|--------|-------|-------|
| 1 fix and tests | delegated | 66ed846 | RED: "ban an already soft-deleted user" and "reject with NotFoundError and write nothing" failed; GREEN: `bun test` 519 pass, lint and tsc clean | new port `userExists` (findOne withDeleted), `banUser` loads the target withDeleted, route documents 404; the withDeleted queries are verified by reading, not by a test; `users.id` is varchar, so a malformed id also answers 404 |
| 2 docs | delegated | 5541062 | structural readback | moderation and architecture pages: 404 and re-ban behavior |

## Next step

Tasks 1 and 2 done; task 3 in progress.
