# Moderation: bans

A ban blocks a user from authenticating for ranked/social routes and soft-hides
their account, without deleting it. Bans are managed entirely under
`user-router.ts`; there is no separate ban module router.

## Ban lifecycle

`UserBanEntity` rows are immutable history: banning never edits a previous
ban row, it closes it and opens a new one.

- **Ban** (`UserBanUser.execute`, `src/modules/user/application/UserBanUser.ts`):
  first closes any currently-active ban for the user by setting its
  `expiresAt` to now (`finishActiveBan`), then inserts a new
  `UserBanEntity` row with `reason`, `bannedBy` (the admin's id) and an
  optional `expiresAt`. `UserBanPostgresRepository.banUser` additionally sets
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
explicitly **admin-only but outside `banGuard`** — an admin must be able to
act on an already-banned user:

| Route | Method | Body | Notes |
| --- | --- | --- | --- |
| `/:userId/ban` | POST | `{ reason, expiresAt? }` | Omitting `expiresAt` bans permanently. |
| `/:userId/unban` | POST | — | Closes the active ban and restores the account. |
| `/:userId/ban/active` | GET | — | `{ activeBan: UserBan \| null }`. |
| `/:userId/ban/history` | GET | — | `{ history: UserBan[] }`. |

The admin check is inline, not through `JwtAdminAuthorizer`: each handler
decodes the bearer token itself and throws `ForbiddenError` when
`role !== UserProfileRole.ADMIN`
(`src/server/routes/user-router.ts:495-497`, and similarly for the other
three routes) — see `docs/architecture.md`'s Auth section for why this differs
from `admin-cosmetics-router.ts`/`admin-moderation-router.ts`.

**Known gap:** `POST /:userId/ban` looks the target user up with
`findOneOrFail` (`UserBanPostgresRepository.banUser`,
`src/modules/user/infrastructure/UserBanPostgresRepository.ts:8-12`). An
unknown `userId` makes TypeORM throw an `EntityNotFoundError`, which is not
one of the five mapped error classes in `src/server/server.ts` — the request
answers an unmapped `500` instead of a `404`.

## `banGuard`

`banGuard.beforeHandle` (`src/server/guards/bandGuard.ts`) decodes the bearer
token, then calls `UserGetActiveBan` for the decoded user id; if there is an
active ban it throws `ForbiddenError` (403). It runs before the route handler
on every router that opts in via `.guard(banGuard, ...)`.

Per `docs/architecture.md`'s Auth section, **`banGuard` is applied to
`user-router.ts`'s authenticated non-admin endpoints and `ticket-router.ts`**,
but **not** to `cosmetics-router.ts`, `me-cosmetics-router.ts`,
`loadout-router.ts`, `public-loadout-router.ts`,
`admin-cosmetics-router.ts` or `admin-moderation-router.ts`. Practical
consequence: **a banned user can still browse the cosmetics catalog and
change their loadout** — only `bearer()` decodes their token there, nothing
checks the ban.

## Relation to annulment

Bans and match annulment are independent systems that are commonly used
together: an admin who annuls a cheater's matches
([match-annulment.md](match-annulment.md)) typically also bans the offending
account, but neither API call triggers the other. `POST /admin/matches/annulments`
takes an `offenderUserId` purely to record who the annulment reason applies to
(`AnnulMatchesRequest`, `src/modules/match-annulment/application/dtos/AnnulMatches.ts`)
— it does not ban that user, and banning a user does not annul their matches.
