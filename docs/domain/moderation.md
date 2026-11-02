# Moderation: bans

A ban blocks a user from authenticating for ranked/social routes and soft-hides
their account, without deleting it. Bans are managed entirely under
`user-router.ts`; there is no separate ban module router.

## Ban lifecycle

`UserBanEntity` rows are immutable history: banning never edits a previous
ban row, it closes it and opens a new one.

- **Ban** (`UserBanUser.execute`, `src/modules/user/application/UserBanUser.ts`):
  first checks that the target user exists — including soft-deleted, i.e.
  already-banned, users (`UserBanRepository.userExists`) — and throws
  `NotFoundError` without writing anything if it does not. Otherwise it closes
  any currently-active ban for the user by setting its `expiresAt` to now
  (`finishActiveBan`), then inserts a new `UserBanEntity` row with `reason`,
  `bannedBy` (the admin's id) and an optional `expiresAt`. Re-banning an
  already banned user therefore closes the previous ban and creates a new one,
  rather than failing. `UserBanPostgresRepository.banUser` additionally sets
  the user's own `deletedAt` (soft delete) as part of banning
  (`src/modules/user/infrastructure/UserBanPostgresRepository.ts:8-27`) — this
  is why queries that must exclude banned/removed accounts filter on
  `deleted_at IS NULL` (for example the player-of-the-week query in
  [seasons-ranks-points.md](seasons-ranks-points.md)).
- **Unban** (`UserUnbanUser.execute`): finds the currently-active ban and sets
  its `expiresAt` to now, then restores the soft-deleted user row
  (`repository.restore`, `UserBanPostgresRepository.ts:54-74`).
- **Active ban** (`UserGetActiveBan.execute`): the most recent ban row for the
  user with `expiresAt IS NULL OR expiresAt > now`, i.e. permanent (`null`
  `expiresAt`) or not yet expired. An expired ban is simply not "active"
  anymore — no explicit un-ban is needed for it to stop applying.
- **History** (`UserGetBanHistory.execute`): every ban row for the user,
  newest first, expired or not.

## Endpoints

All four live in `src/server/routes/user-router.ts`, under `/users`, and are
explicitly **admin-only but outside `requireUser`** — an admin must be able to
act on an already-banned user:

| Route | Method | Body | Notes |
| --- | --- | --- | --- |
| `/:userId/ban` | POST | `{ reason, expiresAt? }` | Omitting `expiresAt` bans permanently. |
| `/:userId/unban` | POST | — | Closes the active ban and restores the account. |
| `/:userId/ban/active` | GET | — | `{ activeBan: UserBan \| null }`. |
| `/:userId/ban/history` | GET | — | `{ history: UserBan[] }`. |

Each handler authorizes through the shared `adminAuthorizer`
(`JwtAdminAuthorizer`, `src/server/auth/AdminAuthorizer.ts`), like every other
admin router: no token answers `401` ("Bearer token is required") and a
non-admin token answers `403` ("Administrator role is required"). The ban
records the admin id from the token as `bannedBy`.

`POST /:userId/ban` answers `404` for an unknown `userId`: `UserBanUser`
checks existence up front (`UserBanRepository.userExists`, looked up with
`withDeleted: true`) and throws `NotFoundError`, which `src/server/server.ts`
maps to `404`, before any ban write happens.

## `requireUser`

`requireUser` (`src/server/auth/requireUser.ts`) verifies the bearer token
once, then calls `UserGetActiveBan` for its user id; if there is an active ban
it throws `ForbiddenError` (403). Otherwise it hands the handler that id as
`userId`. It runs after request validation, on the routes of every router that
mounts it (`.guard({}, (app) => app.use(requireUser)...)`).

Per `docs/architecture.md`'s Auth section, **`requireUser` is applied to
`user-router.ts`'s authenticated non-admin endpoints and every other player
router (`ticket`, `me-cosmetics`, `loadout`, `emote-bar`, `missions`, `shop`,
`event-run`, `player-reports`)**, but **not** to
`cosmetics-router.ts` or `public-loadout-router.ts` (both serve public,
unauthenticated reads with nothing to ban-check) or to
`admin-cosmetics-router.ts` / `admin-moderation-router.ts` (authorized
through `JwtAdminAuthorizer` instead). Practical consequence: **a banned
user cannot browse their personalized cosmetics catalog, refresh a
cosmetic's asset manifest, or read/change their loadout** — each of those
four routes answers 403 before the handler runs.

## Relation to annulment

Bans and match annulment are independent systems that are commonly used
together: an admin who annuls a cheater's matches
([match-annulment.md](match-annulment.md)) typically also bans the offending
account, but neither API call triggers the other. `POST /admin/matches/annulments`
takes an `offenderUserId` purely to record who the annulment reason applies to
(`AnnulMatchesRequest`, `src/modules/match-annulment/application/dtos/AnnulMatches.ts`)
— it does not ban that user, and banning a user does not annul their matches.
