# Architecture

Evolution API is the backend for the Evolution Yu-Gi-Oh! platform: player accounts, ranked play and tiers, cosmetics, and moderation. It follows Hexagonal Architecture (ports and adapters) with a plain composition root — there is no dependency-injection container.

The bracket tournaments module was removed from this API (2026-09). Lightning tournaments came back as an API-owned module (`lightning`) on top of reserved duels; its `lightning_*` tables live in the cosmetics DataSource (see [design/lightning-tournaments.md](design/lightning-tournaments.md)).

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
| `lightning` | Lightning tournaments: short arenas that pair idle players continuously by score, or Swiss rounds (see `design/lightning-swiss.md`), one reserved duel per pairing, with standings, season ranking and prizes, and their worker (see `design/lightning-tournaments.md`); and a chat per tournament, posted over HTTP and read as an SSE stream fanned out through Redis pub/sub (see `design/lightning-chat.md`). |
| `loadout` | A player's equipped cosmetics — own view and public view. |
| `match` | Match history retrieval. |
| `player-reports` | Private opponent reports with server match evidence, rolling quota and audited admin reviews. See [player reports](player-reports.md). |
| `match-annulment` | Batch annulment and reinstatement of ranked matches. |
| `points-ledger` | Per-match points entries that feed the ranked tiers. |
| `rating` | Elo rating compensation when a match is annulled or reinstated. |
| `reserved-duel` | The reservation contract shared with the duel server: issuing and revoking reservations in Redis, and the read-only view of the `reserved_duels` records the server writes. `event-run` builds on it. |
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

Both lists only shrink: fixing a leak or a cycle means deleting its entry, and the test also fails while a fixed entry is still listed. Today both lists are empty. A response schema another module embeds is copied, not imported: `stats` keeps `StatsTierViewSchema`, and `StatsSchemas.test.ts` pins it to `tiers`' `TierViewSchema` so the copy cannot drift. Ports belong to the module that consumes them: `catalog` owns `AssetUrlSigner`, `CosmeticAssetStorage` and `CosmeticAccessPolicy`, which `assets` and `entitlements` implement, and `user` owns `UserDirectory`.

Routers (`src/server/routes/`) and `src/server/composition/` are the composition root and may import any layer of any module. Wiring that needs another module's adapters, like `buildEventRun.ts`, lives in `src/server/composition/`; a builder that only wires its own module (`buildRewardsWorker.ts`, `buildCommunityDecks.ts`) stays in that module's `infrastructure/`.

## Composition root: routers

`src/server/routes/*-router.ts` are the composition root. Each file `new`s up repositories, use cases and controllers by hand and wires them into an Elysia instance — there is no DI container. `src/server/server.ts` mounts every router under `/api/v1` in `mountApiV1Routes`:

| Router | Prefix | Source |
| --- | --- | --- |
| `userRouter` | `/users` | `src/server/routes/user-router.ts` |
| `discordAuthRouter` | `/auth/discord` | `src/server/routes/discord-auth-router.ts` |
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
| `lightningRouter` | `/lightning` | `src/server/routes/lightning-router.ts` |

## Data

Both `DataSource`s point at the same Postgres instance but track migrations independently.

| DataSource | File | Scope | Migrations table |
| --- | --- | --- | --- |
| Shared (evolution-types) | `src/evolution-types/src/data-source.ts` | Users, matches, tournaments, stats, bans, achievements, ratings, points ledger, reserved duel records | `migrations` (run from the `evolution-types` package) |
| Cosmetics | `src/cosmetics-data-source.ts` | Cosmetics, entitlements, user and bot loadouts, user emote bars, rewards (essence ledger, missions, claims, projections), event runs, lightning tournaments (entries, games, results, season rankings) | `cosmetics_migrations`, migrations in `src/migrations/` |

`src/evolution-types/` is the schema package shared by this API and EDOpro-server-ts, vendored by both as a git submodule. Its entities and migrations change in the evolution-types repository and reach this API by bumping the submodule; they are never edited inside this checkout. Its migrations run with the package's own `migration:run`. The cosmetics `DataSource` declares its foreign key to `users(id)` in raw SQL inside its own migration, so it never manages the shared `users` table.

Module-to-DataSource mapping: `catalog`, `loadout`, `emote-bar`, `entitlements`, `community-decks`, `event-run`, `event-stats`, `lightning`, `player-reports`, `reserved-duel`, and `rewards` use the cosmetics `DataSource` (`rewards` also reads matches and achievements from the shared schema through its `*Source` adapters; `user`'s `UserDirectoryPostgresRepository` reads usernames from the shared `users` table; `event-run`, `event-stats`, `lightning` and `reserved-duel` query through `src/shared/persistence/runQuery.ts`, and `lightning` reads usernames and bans from the shared tables in place). Every other module that touches Postgres (`activity-stats`, `user`, `achievements`, `match`, `match-annulment`, `points-ledger`, `rating`, `stats`, `tiers`, `ban-list`) uses the shared `evolution-types` `DataSource`. `ticket` uses Redis, not Postgres. Both `DataSource`s are initialized at startup in `src/index.ts`.

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
| `TooManyRequestsError` | 429 |

Throw one of these from a use case or controller instead of setting `set.status` by hand. Response bodies for mapped errors are `text/plain` (the error's message) — `onError` only sets the status code, it does not shape a body. Elysia's own request validation fails independently of `onError` and answers `422` with a JSON body; production only sends `type`, `on` and `found` (`src/server/openapi/responses.ts`, `ValidationErrorSchema`). Anything that is not one of the eight classes above — a plain `Error`, or an unmapped TypeORM `EntityNotFoundError` from a raw `findOneOrFail` — falls through unmapped and answers `500`. A use case should check existence itself and throw `NotFoundError` before reaching for `findOneOrFail`, the way `UserBanUser` does via `UserBanRepository.userExists`, so an unknown id answers a mapped `404` instead.

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

`requireUser` applies only to the routes inside that guard. **`user-router.ts`** (its authenticated, non-admin endpoints), **`ticket-router.ts`**, **`me-cosmetics-router.ts`**, **`loadout-router.ts`**, **`emote-bar-router.ts`**, **`missions-router.ts`**, **`shop-router.ts`**, **`event-run-router.ts`**, **`player-reports-router.ts`** and the player routes of **`lightning-router.ts`** use it. Public reads (`cosmetics-router.ts`, `public-loadout-router.ts`, `bot-loadout-router.ts`, `public-emote-bar-router.ts`, `achievements-router.ts`, `community-decks-router.ts`, and the list, detail and ranking of `lightning-router.ts`) have no token to check. Admin routes (`admin-*-router.ts`, the admin half of `player-reports-router.ts`, create and cancel in `lightning-router.ts` (its chat delete calls `adminAuthorizer` inside the `requireUser` guard), and the ban endpoints of `user-router.ts`) use `bearer()` with `adminAuthorizer` instead, and stay outside `requireUser` so an admin can act on a banned user.

### Signing in with Discord

`discord-auth-router.ts` adds a second way to get the same JWT. It is on only when the three `DISCORD_*` variables are set (see [operations.md](operations.md)); otherwise its routes answer `404`.

| Step | Route | What happens |
| --- | --- | --- |
| 1 | `GET /auth/discord/start?origin=&redirect=` | The browser navigates here (a page navigation, not a fetch). The API signs a short-lived `state`, sets the `discord_login_nonce` cookie and redirects to Discord. |
| 2 | `GET /auth/discord/callback` | Discord sends the browser back. The API checks the `state` against the cookie, trades Discord's code for the account identity, decides what that identity may do (table below) and redirects to the frontend. |
| 3a | `POST /auth/discord/session` | Signed in: the frontend trades the `code` for the session (`LoginSchema`, the same shape as `POST /users/login`). |
| 3b | `POST /auth/discord/register` | New user: the frontend sends the `register` ticket with the username and account password the user chose, and gets the same body as `POST /users/register`. |

What the callback decides, in order (`AdmitDiscordIdentity`):

| Situation | Result sent to the frontend |
| --- | --- |
| A user has that `discord_id` | `code`, `redirect` |
| Discord sent no email, or one it has not verified | `error=email_unverified` |
| Nobody has that email | `register`, `username` (a suggestion cut to 14 characters), `redirect` |
| One live user has that email (ignoring case) and no Discord account | The account is linked, `email_verified_at` is set, its owner gets an email, then `code`, `redirect` |
| The email belongs to a deleted user, to one with another Discord account, or to two users in different case | `error=account_conflict` |

- **Why a code and not the JWT in the redirect:** a URL ends up in browser history and logs. The code lives 60 seconds in Redis and works once.
- **Why the cookie:** a signed `state` proves the API issued it, not that this browser asked for it. Without the nonce, someone could start a sign-in with their own Discord account and hand the callback URL to a victim, who would land inside the attacker's account.
- **Where the browser returns:** `origin` only selects an entry of `config.discordLogin.frontends`; the URL comes from that registry, never from the request.
- **Discord tokens** are used once to read the identity and are not stored.
- **Linking by email:** safe only because Discord verified the address. Registration here never verified emails, so the linked account may have been created by someone else; the notice email tells the owner the account already had a password and how to reset it. The password is left as it is.
- **Registering:** the email and the Discord account come from the ticket (15 minutes in Redis), never from the request. The account always gets an account password, because clients that sign in to this API without Discord need one. The ticket survives a `400` or `409`, so the form can be corrected, and is removed once the account exists.
- **Other `error` values:** `access_denied`, `invalid_state`, `discord_unavailable`.

#### Linking from settings

A signed-in user links or removes a Discord account without signing out. The three routes sit under `requireUser`:

| Route | What it does |
| --- | --- |
| `GET /auth/discord/link` | `{ linked, canUnlink }` for the caller |
| `POST /auth/discord/link` | Returns the URL the browser must navigate to: `/auth/discord/start` with a `link` intent |
| `DELETE /auth/discord/link` | Removes the link; `409` when the caller has no account password and would be left without a way to sign in |

- **Why an intent:** the OAuth flow starts with a page navigation, which cannot carry the session token in a header. The intent is a five-minute signed token that names the user as `linkUserId`, never as `id`, so it cannot be used as a session.
- **In the flow:** `start` copies the user from the intent into the `state`; the callback then runs `LinkDiscordToUser` instead of the sign-in rules and redirects with `linked=true`, or with `error=discord_in_use` (the Discord account belongs to another user) or `error=already_linked`.
- **Emails need not match here:** the session already proved who the user is. `email_verified_at` is set only when Discord vouches for the same address the account has.

### Verified emails

`users.email_verified_at` records when an address was proven to belong to its user. Registration with email and password does not verify the address, so the column is set only by flows that carry proof:

| Flow | Proof |
| --- | --- |
| Registering or linking through Discord | Discord verified the address |
| `POST /users/reset-account-password` with the token mailed by `POST /users/forgot-password` | The user opened the email; the token carries `purpose: "password-reset"` |
| `POST /users/verify-email` with the token from the confirmation link | The user opened the email; the token carries `purpose: "email-verification"` and the address it was mailed to |

The confirmation link goes out in the welcome email of an email-and-password registration, and again on request:

| Route | What it does |
| --- | --- |
| `POST /users/verify-email` | Public. Marks the address as verified; `401` for an unknown or expired link (24 hours), or one mailed to an address the account no longer uses |
| `GET /users/email-verification` | `{ verified }` for the caller |
| `POST /users/email-verification/resend` | Mails the caller a new link; `{ sent: false }` when already verified, `429` when one was sent less than a minute ago |

An unverified address blocks nothing: the client only reminds the user. The link opens the frontend page listed in `config.emailVerification`, chosen by the request origin. Its token names the user as `verifyUserId`, never as `id`, so it cannot be used as a session.

#### Changing the address

| Route | What it does |
| --- | --- |
| `POST /users/change-email` | Signed in, `{ newEmail, currentPassword }`. Checks the password and mails a link to the new address. The account keeps its address. |
| `POST /users/confirm-email-change` | Public, `{ token }`. Applies the change, records the new address as verified and mails a notice to the previous one. |

- **Why the password:** the email is what recovers the account, so a session alone must not be able to move it.
- **Why the change waits for the link:** opening it proves the user reads the new inbox, so a mistyped address never becomes the account's address.
- **Why the notice:** it is the alarm for the real owner when someone else made the change.
- **Stale links:** the token carries the address the account had at request time; once the account leaves that address the link answers `401`, which also makes it single-use.
- **Address in use** is checked ignoring case, at request and again at confirmation; deleted users count, because the unique index covers them.


The reset endpoint takes only that mailed token. A session token names a user too, but accepting it would let whoever holds a session set a new password without the current one, so it answers `401`; signed-in users change their password through `POST /users/change-account-password`, which asks for the current one. An earlier verification date is never overwritten.

## Workers

Background loops run in-process when their env flag is `true`, or standalone with `bun run src/worker.ts`. Instances share a lock per worker, so only one makes progress at a time.

| Worker | Built in | Started from | Flag |
| --- | --- | --- | --- |
| Rewards (match results → mission progress and essence) | `src/modules/rewards/infrastructure/buildRewardsWorker.ts` | `src/index.ts` | `REWARDS_WORKER_ENABLED` |
| Event runs (applies unfetched duel results, voids stale duels) | `src/server/composition/buildEventRun.ts` | `Server.start()` in `src/server/server.ts` | `EVENT_RUN_WORKER_ENABLED` |
| Lightning tournaments (clock transitions, applying duel records, pairing, completion) | `src/server/composition/buildLightning.ts` | `Server.start()` in `src/server/server.ts`; `src/worker.ts` only when the flag is set | `LIGHTNING_WORKER_ENABLED` |
| Community decks (YGOPRODeck sync) | `src/modules/community-decks/infrastructure/buildCommunityDecks.ts` | `Server.start()` in `src/server/server.ts` | `COMMUNITY_DECKS_WORKER_ENABLED` |

## External services

Env var names only — never read `.env` values, only `src/config/index.ts`.

| Service | Purpose | Env vars |
| --- | --- | --- |
| Email (Resend) | Sends password-reset and account emails from `user-router.ts` (`ResendEmailSender`, `src/shared/email/infrastructure/ResendEmailSender.ts`). | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| R2 (Cloudflare) | Signs URLs and stores cosmetic asset files (`src/modules/assets/infrastructure/createR2AssetUrlSigner.ts`, `createR2CosmeticAssetStorage.ts`). | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_SIGNED_URL_TTL` |
| Redis | Backs ranked game tickets (`src/modules/ticket/infrastructure/BunRedisRankedTicketRepository.ts`), duel reservations (`src/modules/reserved-duel/infrastructure/BunRedisReservationStore.ts`) and the lightning chat rate limit and fan-out; the chat subscriptions use a second connection per instance (`src/modules/lightning/infrastructure/LightningChatHub.ts`). | `REDIS_URL` |

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
- Every operation has a 2xx `application/json` schema, unless it is listed in `EMPTY_BODY_OPERATIONS` (genuinely empty body), `REDIRECT_OPERATIONS` (always answers with a redirect and declares a `302`) or `PENDING_RESPONSE_SCHEMAS` (an explicit, shrinking allowlist for work still in progress).
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
