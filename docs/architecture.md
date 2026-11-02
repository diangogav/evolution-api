# Architecture

Evolution API is the backend for the Evolution Yu-Gi-Oh! platform: player accounts, ranked play and tiers, cosmetics, and moderation. It follows Hexagonal Architecture (ports and adapters) with a plain composition root — there is no dependency-injection container.

Tournaments were removed from this API (2026-09): the shared schema still owns the `lightning_*` and `tournaments` tables, but they now belong to the game server, not to this codebase.

## Stack

Versions come from `package.json`.

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Bun | All scripts (`bun run dev`, `bun test`, `bun run build`) run through Bun, not Node. |
| HTTP framework | ElysiaJS `^1.4.30` | Routers, guards, and request validation. |
| ORM | TypeORM `^0.3.31` | Two separate `DataSource`s (see below). |
| Validation | TypeBox (`@sinclair/typebox` `0.34.48`, Elysia's peer, declared as a dev dependency for the schema tests) | Elysia schemas (`t.Object`, `t.String`, ...) compile to TypeBox and back the OpenAPI schemas. |
| Test runner | `bun:test` | No separate test framework; tests import `describe`/`it`/`expect` from `bun:test`. |
| Lint/format | Biome `2.5.0` | `bun run lint` (check) / `bun run lint:fix`; enforced on commit via husky + lint-staged. |
| Types/build | TypeScript `6.0.3` | `bun run build` runs `tsc` for type-checking and emit. |

## Module layout

Each feature lives under `src/modules/<feature>/`, split into three layers:

```
src/modules/<feature>/
  domain/          # entities, value objects, repository interfaces (ports)
  application/     # use cases / orchestration
  infrastructure/  # Postgres repositories, TypeBox schemas, workers, wiring (adapters)
  index.ts         # public surface for other modules (only when another module uses it)
```

Dependency rule: `infrastructure → application → domain`. Domain depends on nothing else in the module. Routers never expose TypeORM or domain entities directly — they return use case results typed by TypeBox schemas.

Modules that exist today (`src/modules/*`):

| Module | Responsibility |
| --- | --- |
| `achievements` | Achievement catalog and a user's achievement record. |
| `assets` | Signed URLs and storage for cosmetic asset files, backed by R2. |
| `auth` | Login use case and its request/response schemas. |
| `activity-stats` | Daily, weekly and monthly server activity (new users, active players, ranked/unranked/EvoDuel matches, per ban list) for the backoffice. |
| `ban-list` | Ban list catalog and grouping by format. |
| `catalog` | Cosmetics catalog: listing, admin listing, publishing, seeding standard cosmetics. |
| `emote-bar` | A player's equipped emote bar — own view and public view. |
| `community-decks` | Legal decks synced from YGOPRODeck and the public endpoints that list them (see `design/community-decks.md`). |
| `entitlements` | What cosmetics a user has access to, and granting them. |
| `event-run` | Seasonal event gauntlets: the event catalog, runs, event duels and their worker. |
| `event-stats` | Per-event run, wave, deck and player stats for the backoffice. |
| `loadout` | A player's equipped cosmetics — own view and public view. |
| `match` | Match history retrieval. |
| `player-reports` | Private opponent reports with server match evidence, rolling quota and audited admin reviews. See [player reports](player-reports.md). |
| `match-annulment` | Batch annulment and reinstatement of ranked matches. |
| `points-ledger` | Per-match points entries that feed the ranked tiers. |
| `rating` | Elo rating compensation when a match is annulled or reinstated. |
| `rewards` | Essence ledger, missions, the worker that projects progress from match results, the shop (see `rewards.md`). |
| `stats` | Player and global statistics, leaderboard, player of the week. |
| `ticket` | Ranked game tickets, backed by Redis. |
| `tiers` | Ranked tier resolution and the tier catalog (see `ranked-tiers.md`). |
| `user` | Registration, profile, password management, username, bans. |

## Module boundaries

A module reaches another module only through that module's `index.ts`, which re-exports explicit domain and application symbols (`export { X } from "./domain/X"`; never `export *`, never infrastructure). A module gets an `index.ts` once another module needs something from it.

`tests/unit/architecture/module-boundaries.test.ts` enforces this as a ratchet:

- A cross-module import that skips the target's `index.ts` fails, unless it is in `KNOWN_LEAKS`.
- A dependency cycle between modules fails, unless it is in `KNOWN_CYCLES`.
- An `index.ts` that re-exports with `export *` or from outside `domain/` and `application/` fails.

Both lists only shrink: fixing a leak or a cycle means deleting its entry, and the test also fails while a fixed entry is still listed. Today they hold `stats` reusing the `tiers` TypeBox schema, and the `assets` ↔ `catalog` ↔ `entitlements` ↔ `loadout` loop.

Routers (`src/server/routes/`) and `src/server/composition/` are the composition root and may import any layer of any module. Wiring that needs another module's adapters, like `buildEventRun.ts`, lives in `src/server/composition/`; a builder that only wires its own module (`buildRewardsWorker.ts`, `buildCommunityDecks.ts`) stays in that module's `infrastructure/`.

## Composition root: routers

`src/server/routes/*-router.ts` are the composition root. Each file `new`s up repositories, use cases and controllers by hand and wires them into an Elysia instance — there is no DI container. `src/server/server.ts` mounts every router under `/api/v1` in `mountApiV1Routes`:

| Router | Prefix | Source |
| --- | --- | --- |
| `userRouter` | `/users` | `src/server/routes/user-router.ts` |
| `achievementsRouter` | `/achievements` | `src/server/routes/achievements-router.ts` |
| `userAchievementsRouter` | `/users` | `src/server/routes/achievements-router.ts` |
| `leaderboardRouter` | `/stats` | `src/server/routes/leaderboard-router.ts` |
| `rankedTiersRouter` | `/ranked-tiers` | `src/server/routes/ranked-tiers-router.ts` |
| `banListRouter` | `/ban-lists` | `src/server/routes/ban-list-router.ts` |
| `statsRouter` | `/historical-stats` | `src/server/routes/stats-router.ts` |
| `ticketRouter` | `/game-tickets` | `src/server/routes/ticket-router.ts` |
| `cosmeticsRouter` | `/cosmetics` | `src/server/routes/cosmetics-router.ts` |
| `meCosmeticsRouter` | `/me/cosmetics` | `src/server/routes/me-cosmetics-router.ts` |
| `emoteBarRouter` | `/me/emote-bar` | `src/server/routes/emote-bar-router.ts` |
| `loadoutRouter` | `/me/loadout` | `src/server/routes/loadout-router.ts` |
| `publicLoadoutRouter` | `/users/by-username/:username/loadout` | `src/server/routes/public-loadout-router.ts` |
| `botLoadoutRouter` | `/bots/:botName/loadout` | `src/server/routes/bot-loadout-router.ts` |
| `publicEmoteBarRouter` | `/users/by-username/:username/emote-bar` | `src/server/routes/public-emote-bar-router.ts` |
| `adminCosmeticsRouter` | `/admin/cosmetics` | `src/server/routes/admin-cosmetics-router.ts` |
| `playerReportsRouter` | `/me/player-reports` | `src/server/routes/player-reports-router.ts` |
| `adminPlayerReportsRouter` | `/admin/player-reports` | `src/server/routes/player-reports-router.ts` |
| `adminModerationRouter` | `/admin/matches` | `src/server/routes/admin-moderation-router.ts` |
| `adminStatsRouter` | `/admin/stats` | `src/server/routes/admin-stats-router.ts` |
| `adminEventsRouter` | `/admin/events` | `src/server/routes/admin-events-router.ts` |
| `missionsRouter` | `/me/missions` | `src/server/routes/missions-router.ts` |
| `essenceRouter` | `/me/essence` | `src/server/routes/shop-router.ts` |
| `shopRouter` | `/shop` | `src/server/routes/shop-router.ts` |
| `eventsRouter` | `/events` | `src/server/routes/event-run-router.ts` |
| `eventRunsRouter` | `/event-runs` | `src/server/routes/event-run-router.ts` |
| `communityDecksRouter` | `/community-decks` | `src/server/routes/community-decks-router.ts` |

## Data

Both `DataSource`s point at the same Postgres instance but track migrations independently.

| DataSource | File | Scope | Migrations table |
| --- | --- | --- | --- |
| Shared (evolution-types) | `src/evolution-types/src/data-source.ts` | Users, matches, tournaments, stats, bans, achievements, ratings, points ledger, lightning tournaments/ranking | `migrations` (owned and run by the game server) |
| Cosmetics | `src/cosmetics-data-source.ts` | Cosmetics, entitlements, user and bot loadouts, user emote bars, rewards (essence ledger, missions, claims, projections) | `cosmetics_migrations`, migrations in `src/migrations/` |

`src/evolution-types/` is a vendored package owned by the game server. Do not edit its entities or migrations from this repository; it is shared infrastructure, not API-local code. The cosmetics `DataSource` declares its foreign key to `users(id)` in raw SQL inside its own migration, so it never manages the shared `users` table.

Module-to-DataSource mapping: `catalog`, `loadout`, `emote-bar`, `entitlements`, `community-decks`, `event-run`, `event-stats`, `player-reports`, and `rewards` use the cosmetics `DataSource` (`rewards` also reads matches and achievements from the shared schema through its `*Source` adapters; `loadout`'s `UserDirectoryPostgresRepository` reads usernames from the shared `users` table; `event-run` and `event-stats` query through `src/shared/persistence/runQuery.ts`). Every other module that touches Postgres (`activity-stats`, `user`, `achievements`, `match`, `match-annulment`, `points-ledger`, `rating`, `stats`, `tiers`, `ban-list`) uses the shared `evolution-types` `DataSource`. `ticket` uses Redis, not Postgres. Both `DataSource`s are initialized at startup in `src/index.ts`.

## Errors

Shared error classes live in `src/shared/errors/`. `mapDomainErrorStatus` in `src/server/server.ts` maps them to HTTP status codes in a single `onError` hook:

| Error class | Status |
| --- | --- |
| `ConflictError` | 409 |
| `AuthenticationError` | 401 |
| `NotFoundError` | 404 |
| `InvalidArgumentError` | 400 |
| `ForbiddenError` | 403 |
| `UnprocessableError` | 422 |
| `PaymentRequiredError` | 402 |

Throw one of these from a use case or controller instead of setting `set.status` by hand. Response bodies for mapped errors are `text/plain` (the error's message) — `onError` only sets the status code, it does not shape a body. Elysia's own request validation fails independently of `onError` and answers `422` with a JSON body; production only sends `type`, `on` and `found` (`src/server/openapi/responses.ts`, `ValidationErrorSchema`). Anything that is not one of the seven classes above — a plain `Error`, or an unmapped TypeORM `EntityNotFoundError` from a raw `findOneOrFail` — falls through unmapped and answers `500`. A use case should check existence itself and throw `NotFoundError` before reaching for `findOneOrFail`, the way `UserBanUser` does via `UserBanRepository.userExists`, so an unknown id answers a mapped `404` instead.

## Auth

| Mechanism | File | Behavior |
| --- | --- | --- |
| `apiJwt` | `src/server/auth/apiJwt.ts` | The single `JWT` instance (`src/shared/JWT.ts`) every router uses to sign and verify tokens. |
| `requireUser` | `src/server/auth/requireUser.ts` | Elysia plugin with a scoped `resolve`: verifies the bearer token once, answers `401` when it is missing (`No token provided`), invalid or expired (`Invalid token`) or has no user id (`Token has no user id`), answers `403` (`User is banned`) when `UserGetActiveBan` finds an active ban, and otherwise hands the handler a typed `userId`. It runs after request validation, so invalid input still answers `422` first. |
| `adminAuthorizer` | `src/server/auth/AdminAuthorizer.ts` | Shared `JwtAdminAuthorizer`. `requireAdmin(bearer)` answers `401` without a token or user id and `403` (`Administrator role is required`) unless the token's role is `admin`; it returns the admin's `userId`. Admin routers receive it as an injected `authorizer`, so tests replace it with a fake. |

Player routers mount `requireUser` inside a guard and read `userId` from the handler context; no handler decodes the JWT itself:

```ts
new Elysia({ prefix: "/me/missions" }).guard({}, (app) =>
	app.use(requireUser).get("/", ({ userId, query }) => getMyMissions.run({ userId, ... })),
);
```

`requireUser` applies only to the routes inside that guard. **`user-router.ts`** (its authenticated, non-admin endpoints), **`ticket-router.ts`**, **`me-cosmetics-router.ts`**, **`loadout-router.ts`**, **`emote-bar-router.ts`**, **`missions-router.ts`**, **`shop-router.ts`**, **`event-run-router.ts`** and **`player-reports-router.ts`** use it. Public reads (`cosmetics-router.ts`, `public-loadout-router.ts`, `bot-loadout-router.ts`, `public-emote-bar-router.ts`, `achievements-router.ts`, `community-decks-router.ts`) have no token to check. Admin routes (`admin-*-router.ts`, the admin half of `player-reports-router.ts`, and the ban endpoints of `user-router.ts`) use `bearer()` with `adminAuthorizer` instead, and stay outside `requireUser` so an admin can act on a banned user.

## Workers

Background loops run in-process when their env flag is `true`, or standalone with `bun run src/worker.ts`. Instances share a lock per worker, so only one makes progress at a time.

| Worker | Built in | Started from | Flag |
| --- | --- | --- | --- |
| Rewards (match results → mission progress and essence) | `src/modules/rewards/infrastructure/buildRewardsWorker.ts` | `src/index.ts` | `REWARDS_WORKER_ENABLED` |
| Event runs (applies unfetched duel results, voids stale duels) | `src/server/composition/buildEventRun.ts` | `Server.start()` in `src/server/server.ts` | `EVENT_RUN_WORKER_ENABLED` |
| Community decks (YGOPRODeck sync) | `src/modules/community-decks/infrastructure/buildCommunityDecks.ts` | `Server.start()` in `src/server/server.ts` | `COMMUNITY_DECKS_WORKER_ENABLED` |

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
2. If the route needs a token — through `requireUser` or `adminAuthorizer` — add `security: [{ bearerAuth: [] }]` to `detail` **and** add its `METHOD /api/v1/<path>` key to `PROTECTED_OPERATIONS` in the ratchet test.
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
  │  requireUser (player: userId, ban check) / adminAuthorizer.requireAdmin(bearer)
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

An error the use case does not throw as one of the seven shared classes (a plain `Error`, an unwrapped `EntityNotFoundError`, an upstream fetch failure) skips the mapping step and reaches the client as an unmapped `500`.

`UserBanUser` avoids this for `POST /:userId/ban` by checking
`UserBanRepository.userExists` up front (including soft-deleted, i.e.
already-banned, users) and throwing `NotFoundError` for an unknown user id, so
the route answers a mapped `404` instead of an unwrapped
`EntityNotFoundError`'s `500`.

## Next steps

- Ranked tiers, points, ratings, annulment, bans and cosmetics as domain concepts: [`docs/domain/`](domain/README.md).
- Environment variables, running locally, migrations, seeds, deployment: [`docs/operations.md`](operations.md).
