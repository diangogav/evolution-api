# Operations

This page is for whoever has to run, configure, migrate or deploy Evolution
API: environment variables, local setup, the two migration paths, the
maintenance scripts, and what the Dockerfile and CI pipeline actually do. For
module layout, the two DataSources, auth and Swagger, see
[architecture.md](architecture.md); for what the domain concepts mean, see
[domain/README.md](domain/README.md).

## Quick path (running locally)

1. Clone with the `evolution-types` submodule: `git submodule update --init --recursive` (it is a git submodule, see `.gitmodules`; the shared schema code lives there).
2. Copy `.env.example` to `.env` and fill in the variables listed below. Never commit `.env`.
3. Start Postgres and Redis: `docker compose up -d` (`docker-compose.yaml`).
4. Install dependencies: `bun install`.
5. Apply the cosmetics migrations and seed them (see [Database and migrations](#database-and-migrations)).
6. Start the dev server: `bun run dev` (watch mode over `src/index.ts`, `package.json`).
7. Swagger UI is served at `/swagger` (see [architecture.md](architecture.md#swagger-and-the-openapi-ratchet)); locally that is `http://localhost:<PORT, default 3000>/swagger`.

Tests, lint and build:

| Command | Runs | Notes |
| --- | --- | --- |
| `bun test` | Unit tests (`bun:test`) | `bunfig.toml` scopes discovery to `./tests`, preloads `tests/setup.ts`, and always runs with coverage (`coverageReporter = ["text"]`). |
| `bun run test:coverage` | Same, with an explicit `--coverage` flag | `package.json` |
| `bun run lint` / `bun run lint:fix` | Biome check / autofix | Also enforced on commit via husky + lint-staged (`package.json`). |
| `bun run build` | `tsc` type-check and emit | `package.json` |

## Environment variables

Names and purpose only — values live in `.env`, never in this repo or this
page. Required/optional and defaults are read from `src/config/index.ts`
unless noted otherwise.

### Server

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | Optional | `3000` | Port the Elysia server listens on (`src/server/server.ts`). |
| `NODE_ENV` | Optional | unset | Read directly (not through `ensureEnvVariable`). When exactly `"production"`, the two localhost password-reset frontends are omitted (`src/config/index.ts`). |

### Postgres (shared schema, `evolution-types`)

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `POSTGRES_USER` | Yes* | — | Postgres username. |
| `POSTGRES_PASSWORD` | Yes* | — | Postgres password. |
| `POSTGRES_DB` | Yes* | — | Database name. |
| `POSTGRES_HOST` | Optional | `localhost` | Postgres host. |
| `POSTGRES_PORT` | Optional | `5432` | Postgres port. |

\* Read directly in `src/evolution-types/src/config`, not through
`ensureEnvVariable` like every other variable below. A missing or wrong value
does not crash at startup — it surfaces later as a connection error (see
[Operational notes](#operational-notes)). `docker-compose.yaml` consumes the
same four names for the local Postgres container.

### Redis

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `REDIS_URL` | Required | — | Connection string for the single shared Redis client (`src/shared/redis/redisClient.ts`), backing ranked game tickets. |

### JWT / auth

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `JWT_SECRET` | Required | — | Signing secret for issued tokens. |
| `JWT_ISSUER` | Required | — | `iss` claim / issuer check. |
| `JWT_EXPIRES_IN` | Optional | `24h` | Token lifetime. Must match `\d+[smhd]` (e.g. `30m`, `8h`, `7d`) or startup throws (`src/config/index.ts`). |

### Email — Resend (active sender)

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | Required | — | `ResendEmailSender` (`src/shared/email/infrastructure/ResendEmailSender.ts`), used from `user-router.ts` for password-reset and account emails. |
| `RESEND_FROM_EMAIL` | Required | — | Sender address for those emails. |

### Email — SendGrid (present, not wired)

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SENDGRID_API_KEY` | Required | — | Validated at startup even though `SengridEmailSender` is not used by any router — see [architecture.md](architecture.md#external-services). |
| `SENDGRID_FROM_EMAIL` | Required | — | Same. |
| `SENDGRID_TEMPLATE_ID` | Required | — | Same. |

### R2 (Cloudflare — cosmetic assets)

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `R2_ACCESS_KEY_ID` | Required | — | R2 credentials for signing and storage (`src/modules/assets/infrastructure/createR2AssetUrlSigner.ts`, `createR2CosmeticAssetStorage.ts`). |
| `R2_SECRET_ACCESS_KEY` | Required | — | Same. |
| `R2_BUCKET` | Required | — | Bucket holding cosmetic asset files. |
| `R2_ENDPOINT` | Required | — | R2 S3-compatible endpoint. |
| `R2_SIGNED_URL_TTL` | Optional | `600` | Seconds a signed asset URL stays valid. |

### Tournaments (upstream service)

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TOURNAMENTS_API_URL` | Required | — | Base URL the proxy (`TournamentGateway`, `TournamentController`) calls. |
| `TOURNAMENTS_WEBHOOK_URL` | Required | — | Webhook URL registered with the upstream service. |

See [domain/tournaments.md](domain/tournaments.md) for what the proxy does with these.

### Season

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `SEASON` | Required | — | Parsed as a number (`Number(...)`). The default `season` query parameter across routes; see the glossary in [domain/README.md](domain/README.md). |

### Annulment

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ANNULMENT_ENABLED` | Optional | `false` | Only the literal string `"true"` enables it. Gates the annulment/reinstatement use cases; see [Operational notes](#operational-notes) and [domain/match-annulment.md](domain/match-annulment.md). |

## Database and migrations

Both DataSources point at the same Postgres instance but track migrations
independently — see [architecture.md](architecture.md#data) for the full
mapping of modules to DataSource.

**Shared schema is migrated by the game server.** `src/evolution-types/` is a
vendored, read-only submodule; this repo must never run migrations against
its `migrations` table. `init.sql` (mounted by `docker-compose.yaml` into the
local Postgres container) only enables the `uuid-ossp` extension and sets the
session timezone to UTC — it does not create schema.

The **cosmetics DataSource** (`src/cosmetics-data-source.ts`) owns its own
migration history in the `cosmetics_migrations` table, with hand-written
migration files under `src/migrations/`:

| Command | `package.json` script | What it does |
| --- | --- | --- |
| `bun run migration:cosmetics:run` | `bun run src/scripts/run-cosmetics-migrations.ts` | `cosmeticsDataSource.runMigrations()` — applies pending migrations. |
| `bun run migration:cosmetics:revert` | `bun run src/scripts/run-cosmetics-migrations.ts --revert` | `cosmeticsDataSource.undoLastMigration()` — reverts the single most recent migration. |
| `bun run seed:cosmetics` | `bun run src/scripts/seed-cosmetics.ts` | Seeds the standard cosmetic set (`SeedStandardCosmetics`). Idempotent — logs `created`/`skipped` counts. |

Migrations are written by hand (`src/scripts/run-cosmetics-migrations.ts`); a
`migration:generate` script is intentionally not provided, since the API runs
on Bun while the shared submodule's own migrations use the TypeORM CLI via
ts-node.

## Scripts

All six scripts live in `src/scripts/`, run through Bun, and open/close their
own DataSource connection.

| Script | Command | Writes | Safety |
| --- | --- | --- | --- |
| `assign-cosmetic.ts` | `bun run assign:cosmetic <userId> <assetRef> <source>` (all three args required) | One `entitlements` row (cosmetics DataSource) | Idempotent: no-ops if the user already has that cosmetic entitlement. Validates `source` against the `EntitlementSource` enum and throws if `assetRef` was not found (seed cosmetics first). The only way to grant an EXCLUSIVE-tier cosmetic. |
| `index-cosmetic-assets.ts` | `bun run index:cosmetic-assets` | `assetFiles` on cosmetics that don't have it yet (cosmetics DataSource) + reads R2 via the asset signer | One-time/backfill indexer. Skips cosmetics that already have `assetFiles` set; no deletes. |
| `rating-compensate.ts` | `bun run rating:compensate` | `reversal` rows in `rating_history` and the `player_ratings` reprojection, via `RatingCompensationPostgresRepository` (shared DataSource) | Reads `matches.anulled = true` (shared schema, read-only). Idempotent: inserts use `ON CONFLICT DO NOTHING` against the unique index `(match_id, user_id, rank_id, kind, cycle)` on `rating_history` (`src/evolution-types/src/entities/RatingHistoryEntity.ts`), so already-compensated matches are skipped. The script's own header comment names an older three-column constraint; the entity is the source of truth. |
| `run-cosmetics-migrations.ts` | see [Database and migrations](#database-and-migrations) | Cosmetics schema DDL | — |
| `seed-cosmetics.ts` | see [Database and migrations](#database-and-migrations) | `catalog` rows (cosmetics DataSource) | Idempotent. |
| `upload-cosmetic-asset.ts` | `bun run upload:cosmetic-asset <local-file> <r2-key> [--replace]` | One R2 object only (no database writes) | Refuses to overwrite an existing object unless `--replace` is passed; rejects keys that are absolute, contain `..`, or have no `/`; verifies the uploaded byte size matches the local file before reporting success. |

None of these six write to the shared schema except `rating-compensate.ts`,
and only to rating history and ratings — never to `matches` or the points
ledger directly.

### `database-scripts/` — manual, destructive SQL

The four files under `database-scripts/` are raw SQL, meant to be run by hand
against Postgres (for example with `psql`). They are **not** wired to any
`package.json` script or CLI argument parsing, and none of them has a
dry-run mode.

**These scripts are out of date.** All four read and write `player_stats.ban_list_name`, but
`player_stats` is now keyed by `rank_id` (`src/evolution-types/src/entities/PlayerStatsEntity.ts`), so they
no longer match the schema and must not be run as they are. `player_stats` is maintained as a projection
of the points ledger (see [points ledger and ratings](domain/points-ledger-and-ratings.md)). The table below
describes what each script was written to do.

| File | Scope | Destructive? |
| --- | --- | --- |
| `caculate_stats_by_ban_list_name.sql` | All seasons, every ban list except `Global` | Upsert only (`INSERT ... ON CONFLICT DO UPDATE`); no delete. |
| `calculate_global_stats.sql` | All seasons, `Global` only | Upsert only; no delete. |
| `calculate_stats_by_ban_list_name_for_a_season.sql` | One season, every ban list except `Global` | **Yes** — `DELETE FROM player_stats WHERE season = season_number AND ban_list_name != 'Global'` runs before the rebuild. |
| `calculate_global_stats for_a_season.sql` | One season, `Global` only | **Yes** — `DELETE FROM player_stats WHERE season = season_number AND ban_list_name = 'Global'` runs before the rebuild. |

The two season-scoped files hardcode the target season as `season_number INT
:= 5` inside a `DO $$ ... $$` block — running one requires hand-editing that
constant first. There is no confirmation prompt, dry-run flag, or explicit
transaction/rollback wrapper beyond the implicit statement-level atomicity of
the `DO` block. Treat the two season-scoped scripts as one-shot,
hand-reviewed operations against production data, not routine tooling.

## Deployment

**Dockerfile**: base image `oven/bun`. It copies `package.json`/`bun.lock`,
sets `NODE_ENV=production`, installs `git`, runs `bun install --production`,
copies `src/` and `tsconfig.json`, then clones `evolution-types` fresh with
`git clone --depth 1` from its GitHub URL — **not** the pinned submodule
commit used locally (`.gitmodules`). This means an image build always pulls
whatever is on `evolution-types`' default branch at build time, unlike local
dev's pinned submodule checkout. There is no `tsc build` step in the image:
it runs `bun src/index.ts` directly from source, and exposes port `3000`.

Configuration reaches the container only through environment variables (the
tables above) — the Dockerfile does not bake in secrets, and `.dockerignore`
excludes `src/evolution-types` (cloned fresh in the image) and `.env*`.

**CI** (`.github/workflows/pipeline.yaml`): runs on push/PR to `main`.
Checkout → set up Bun → `git submodule update --init --recursive` → `bun
install` → `bun run lint` → copy `.env.test` to `.env` → `bun test
--runInBand` → `bun run build`. It stops there: **the pipeline does not build
or push a Docker image and does not deploy** — there is no CD step in this
repository.

**Season rollover**: `SEASON` is a plain required environment variable read
once at process startup (`src/config/index.ts`). Nothing in the code rolls
the season automatically; advancing it means changing the `SEASON` value and
restarting/redeploying the process. No in-app rollover endpoint or script was
found in this repository.

## Operational notes

- **Startup order** (`src/index.ts`): shared Postgres DataSource `connect()` → cosmetics Postgres DataSource `initialize()` → Redis `connect()` → Elysia server `listen()`. Each connection is awaited, but a failure is only logged (`.catch(error => logger.error(error))`) — it is not fatal. The HTTP server still starts and listens even if Postgres or Redis failed to connect at boot; a failed connection then surfaces later, per request.
- **Missing required env vars crash startup, not at request time.** `src/config/index.ts` and `src/evolution-types/src/config` are imported eagerly when the process starts; a missing `ensureEnvVariable`-validated variable throws synchronously with `Environment variable <NAME> is not set` before any DataSource or server code runs. `POSTGRES_*` variables are the exception — they are read directly without `ensureEnvVariable`, so a missing or wrong Postgres variable does not crash at startup; it only fails later, when the shared DataSource tries to connect.
- **Annulment switch**: `ANNULMENT_ENABLED` gates `AnnulMatchesUseCase` and `UnannulMatchesUseCase` (`src/server/routes/admin-moderation-router.ts`). See [domain/match-annulment.md](domain/match-annulment.md) for the full flow and idempotency guarantees.
- **Upstream tournaments outage**: tournament operations that call the upstream service document, and can return, a `500` with the plain-text description "Upstream tournaments service unavailable" (`src/modules/tournaments/infrastructure/TournamentController.ts`). See [domain/tournaments.md](domain/tournaments.md).
- **Redis dependency**: the `ticket` module (`BunRedisRankedTicketRepository`) is the only consumer of Redis. If `REDIS_URL` is wrong or Redis is unreachable, only ranked-ticket endpoints are affected — every other module uses the Postgres DataSources instead (see [architecture.md](architecture.md#data)).

## Next steps

- Module layout, the two DataSources, auth and Swagger: [architecture.md](architecture.md).
- Domain concepts (seasons, points, ratings, annulment, bans, cosmetics, tournaments): [domain/README.md](domain/README.md).
- Client-facing ranked tier integration guide: [ranked-tiers.md](ranked-tiers.md).
