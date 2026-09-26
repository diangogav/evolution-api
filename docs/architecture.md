# Architecture

Evolution API is the backend for the Evolution Yu-Gi-Oh! platform: player accounts, ranked play and tiers, cosmetics, and moderation. It follows Hexagonal Architecture (ports and adapters) with a plain composition root — there is no dependency-injection container.

Tournaments were removed from this API (2026-09): the shared schema still owns the `lightning_*` and `tournaments` tables, but they now belong to the game server, not to this codebase.

## Stack

Versions come from `package.json`.

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Bun | All scripts (`bun run dev`, `bun test`, `bun run build`) run through Bun, not Node. |
| HTTP framework | ElysiaJS `^1.4.29` | Routers, guards, and request validation. |
| ORM | TypeORM `^0.3.28` | Two separate `DataSource`s (see below). |
| Validation | TypeBox (`@sinclair/typebox` `0.34.48`, an Elysia peer dependency) | Elysia schemas (`t.Object`, `t.String`, ...) compile to TypeBox and back the OpenAPI schemas. |
| Test runner | `bun:test` | No separate test framework; tests import `describe`/`it`/`expect` from `bun:test`. |
| Lint/format | Biome `2.5.0` | `bun run lint` (check) / `bun run lint:fix`; enforced on commit via husky + lint-staged. |
| Types/build | TypeScript `6.0.3` | `bun run build` runs `tsc` for type-checking and emit. |

## Module layout

Each feature lives under `src/modules/<feature>/`, split into three layers:

```
src/modules/<feature>/
  domain/          # entities, value objects, repository interfaces (ports)
  application/     # use cases / orchestration
  infrastructure/  # TypeORM repositories, controllers, schemas (adapters)
```

Dependency rule: `infrastructure → application → domain`. Domain depends on nothing else in the module. Controllers never expose TypeORM or domain entities directly — they map through DTOs and TypeBox schemas.

Modules that exist today (`src/modules/*`):

| Module | Responsibility |
| --- | --- |
| `assets` | Signed URLs and storage for cosmetic asset files, backed by R2. |
| `auth` | Login use case and its request/response schemas. |
| `ban-list` | Ban list catalog and grouping by format. |
| `catalog` | Cosmetics catalog: listing, admin listing, publishing, seeding standard cosmetics. |
| `entitlements` | What cosmetics a user has access to, and granting them. |
| `loadout` | A player's equipped cosmetics — own view and public view. |
| `match` | Match history retrieval. |
| `match-annulment` | Batch annulment and reinstatement of ranked matches. |
| `points-ledger` | Per-match points entries that feed the ranked tiers. |
| `rating` | Elo rating compensation when a match is annulled or reinstated. |
| `stats` | Player and global statistics, leaderboard, player of the week. |
| `ticket` | Ranked game tickets, backed by Redis. |
| `tiers` | Ranked tier resolution and the tier catalog (see `ranked-tiers.md`). |
| `user` | Registration, profile, password management, username, bans. |

## Composition root: routers

`src/server/routes/*-router.ts` are the composition root. Each file `new`s up repositories, use cases and controllers by hand and wires them into an Elysia instance — there is no DI container. `src/server/server.ts` mounts every router under `/api/v1` in `mountApiV1Routes`:

| Router | Prefix | Source |
| --- | --- | --- |
| `userRouter` | `/users` | `src/server/routes/user-router.ts` |
| `leaderboardRouter` | `/stats` | `src/server/routes/leaderboard-router.ts` |
| `rankedTiersRouter` | `/ranked-tiers` | `src/server/routes/ranked-tiers-router.ts` |
| `banListRouter` | `/ban-lists` | `src/server/routes/ban-list-router.ts` |
| `statsRouter` | `/historical-stats` | `src/server/routes/stats-router.ts` |
| `ticketRouter` | `/game-tickets` | `src/server/routes/ticket-router.ts` |
| `cosmeticsRouter` | `/cosmetics` | `src/server/routes/cosmetics-router.ts` |
| `meCosmeticsRouter` | `/me/cosmetics` | `src/server/routes/me-cosmetics-router.ts` |
| `loadoutRouter` | `/me/loadout` | `src/server/routes/loadout-router.ts` |
| `publicLoadoutRouter` | `/users/by-username/:username/loadout` | `src/server/routes/public-loadout-router.ts` |
| `adminCosmeticsRouter` | `/admin/cosmetics` | `src/server/routes/admin-cosmetics-router.ts` |
| `adminModerationRouter` | `/admin/matches` | `src/server/routes/admin-moderation-router.ts` |

## Data

Both `DataSource`s point at the same Postgres instance but track migrations independently.

| DataSource | File | Scope | Migrations table |
| --- | --- | --- | --- |
| Shared (evolution-types) | `src/evolution-types/src/data-source.ts` | Users, matches, tournaments, stats, bans, achievements, ratings, points ledger, lightning tournaments/ranking | `migrations` (owned and run by the game server) |
| Cosmetics | `src/cosmetics-data-source.ts` | Cosmetics, entitlements, user loadouts | `cosmetics_migrations`, migrations in `src/migrations/` |

`src/evolution-types/` is a vendored package owned by the game server. Do not edit its entities or migrations from this repository; it is shared infrastructure, not API-local code. The cosmetics `DataSource` declares its foreign key to `users(id)` in raw SQL inside its own migration, so it never manages the shared `users` table.

Module-to-DataSource mapping: `catalog`, `loadout`, and `entitlements` use the cosmetics `DataSource`. Every other module that touches Postgres (`user`, `match`, `match-annulment`, `points-ledger`, `rating`, `stats`, `tiers`, `ban-list`) uses the shared `evolution-types` `DataSource`. `ticket` uses Redis, not Postgres. Both `DataSource`s are initialized at startup in `src/index.ts`.

## Errors

Shared error classes live in `src/shared/errors/`. `mapDomainErrorStatus` in `src/server/server.ts` maps them to HTTP status codes in a single `onError` hook:

| Error class | Status |
| --- | --- |
| `ConflictError` | 409 |
| `AuthenticationError` | 401 |
| `NotFoundError` | 404 |
| `InvalidArgumentError` | 400 |
| `ForbiddenError` | 403 |

Throw one of these from a use case or controller instead of setting `set.status` by hand. Response bodies for mapped errors are `text/plain` (the error's message) — `onError` only sets the status code, it does not shape a body. Elysia's own request validation fails independently of `onError` and answers `422` with a JSON body; production only sends `type`, `on` and `found` (`src/server/openapi/responses.ts`, `ValidationErrorSchema`). Anything that is not one of the five classes above — a plain `Error`, or a TypeORM `EntityNotFoundError` (for example `findOneOrFail` in `UserBanPostgresRepository`) — falls through unmapped and answers `500`.

## Auth

| Mechanism | File | Behavior |
| --- | --- | --- |
| `bearer()` (`@elysiajs/bearer`) | plugin, used per router | Exposes the raw `Authorization: Bearer <token>` value as `bearer` in the handler context. Used alone (without `banGuard`) where a route only needs to decode the token, not check a ban — e.g. `admin-cosmetics-router.ts` and `admin-moderation-router.ts`, which authorize through `JwtAdminAuthorizer` instead. |
| `banGuard` | `src/server/guards/bandGuard.ts` | `beforeHandle` that decodes the bearer token and throws `AuthenticationError` (401) if it is missing or invalid, or `ForbiddenError` (403) if the user has an active ban. |
| `JwtAdminAuthorizer` | `src/server/auth/AdminAuthorizer.ts` | `requireAdmin(token)`: throws `AuthenticationError` if the token is missing or has no user id, `ForbiddenError` if the decoded role is not `ADMIN`. Used by `admin-cosmetics-router.ts` and `admin-moderation-router.ts`. |

Which routers use `banGuard`: **`user-router.ts`** (its authenticated, non-admin endpoints), **`ticket-router.ts`**, **`me-cosmetics-router.ts`**, and **`loadout-router.ts`** use it. **`cosmetics-router.ts`, `public-loadout-router.ts`, `admin-cosmetics-router.ts`, and `admin-moderation-router.ts` do not** — `cosmetics-router.ts` and `public-loadout-router.ts` serve public, unauthenticated reads, so there is no bearer token to check a ban against. Admin endpoints inside `user-router.ts` (ban/unban a user) check the decoded `role` inline rather than through `JwtAdminAuthorizer`; `admin-cosmetics-router.ts` and `admin-moderation-router.ts` use `JwtAdminAuthorizer` consistently. Ban routes are intentionally outside `banGuard` (an admin must be able to act on a banned user); annulment routes use `JwtAdminAuthorizer`.

## External services

Env var names only — never read `.env` values, only `src/config/index.ts`.

| Service | Purpose | Env vars |
| --- | --- | --- |
| Email (Resend) | Sends password-reset and account emails from `user-router.ts` (`ResendEmailSender`, `src/shared/email/infrastructure/ResendEmailSender.ts`). | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| R2 (Cloudflare) | Signs URLs and stores cosmetic asset files (`src/modules/assets/infrastructure/createR2AssetUrlSigner.ts`, `createR2CosmeticAssetStorage.ts`). | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_SIGNED_URL_TTL` |
| Redis | Backs ranked game tickets (`src/modules/ticket/infrastructure/BunRedisRankedTicketRepository.ts`). | `REDIS_URL` |

## Swagger and the OpenAPI ratchet

| File | Role |
| --- | --- |
| `src/server/swagger.ts` | Builds the `@elysiajs/swagger` plugin: title, description, servers, the full tag list with descriptions, `x-tagGroups` (sidebar grouping), and the `bearerAuth` security scheme. |
| `src/server/swagger-theme.ts` | `EVOLUTION_SCALAR_CSS`: the Evolution brand palette applied to the Scalar UI (dark by default). |
| `src/server/openapi/responses.ts` | Helpers used in every route's `detail.responses`: `jsonOk` (2xx with a schema and optional example), `emptyOk` (2xx with no body), `errorResponse` (a one-off error description, used for upstream failures), `errorResponses` (the fixed 400/401/403/404/409/422 catalog), plus `ErrorSchema` and `ValidationErrorSchema`. |
| `tests/unit/server/swagger/openapi-document.test.ts` | The ratchet test. Mounts the real routers with `mountApiV1Routes`, reads `/swagger/json`, and asserts on the generated document. |

The ratchet enforces:

- Every operation has at least one tag, and every tag used is declared (with a non-empty description) in `swagger.ts`.
- Every declared tag appears in exactly one tag group (`x-tagGroups`).
- Every operation has a non-empty `summary`.
- `security: [{ bearerAuth: [] }]` is present on exactly the operations listed in `PROTECTED_OPERATIONS` — an explicit, reviewed list (not a regex over handler source), so a new protected route must be added there by hand.
- `info.title` is not tournament-specific, `info.version` matches semver, and `servers` is exactly production + local.
- Every operation has a 2xx `application/json` schema, unless it is listed in `EMPTY_BODY_OPERATIONS` (genuinely empty body) or `PENDING_RESPONSE_SCHEMAS` (an explicit, shrinking allowlist for work still in progress).
- Every response example that ships alongside a schema actually validates against that schema (`Value.Check`).

### Adding a new endpoint: checklist

1. Give the route a `detail` with `tags` (using an existing tag, or a new one added to `TAGS` in `swagger.ts` and to exactly one group in `TAG_GROUPS`), a `summary`, and a `description`.
2. If the handler reads a bearer token — directly, through `banGuard`, or through `JwtAdminAuthorizer` — add `security: [{ bearerAuth: [] }]` to `detail` **and** add its `METHOD /api/v1/<path>` key to `PROTECTED_OPERATIONS` in the ratchet test.
3. Declare a 2xx response: `jsonOk(schema, description, example?)` for a JSON body, `emptyOk(description)` for no body (and add the key to `EMPTY_BODY_OPERATIONS`). Do not add new entries to `PENDING_RESPONSE_SCHEMAS` — it only shrinks.
4. If you give a response an `example`, make sure it matches the schema — the ratchet validates it.
5. Use `errorResponses(...)` for the standard error catalog.
6. Run `bun test tests/unit/server/swagger` before opening a PR.

## Testing conventions

Tests live under `tests/`, mirroring `src/` (for example `tests/unit/modules/<feature>/...`, `tests/unit/server/...`). Everything runs on `bun:test` (`describe`/`it`/`expect`, no separate framework). Repository tests generally use hand-written fakes over mocking libraries (see `tests/unit/modules/match-annulment/application/AnnulUnannulRatingCycle.test.ts` for an example).

## Request flow

```
Client
  │  Authorization: Bearer <token>
  ▼
Router (src/server/routes/*-router.ts)
  │  .use(bearer()) / .guard(banGuard) / JwtAdminAuthorizer.requireAdmin()
  ▼
Use case (application/)
  │
  ▼
Repository / DataSource (infrastructure/, TypeORM or Redis)
  │
  ▼
Domain error?  ──yes──▶ mapDomainErrorStatus (server.ts) ──▶ mapped status, text/plain body
  │no
  ▼
2xx JSON response (schema documented in detail.responses)
```

An error the use case does not throw as one of the five shared classes (a plain `Error`, an unwrapped `EntityNotFoundError`, an upstream fetch failure) skips the mapping step and reaches the client as an unmapped `500`.

## Next steps

- Ranked tiers, points, ratings, annulment, bans and cosmetics as domain concepts: [`docs/domain/`](domain/README.md).
- Environment variables, running locally, migrations, seeds, deployment: [`docs/operations.md`](operations.md).
