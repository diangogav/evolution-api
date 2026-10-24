# Repository Guidelines

Backend API (`evolution-api`) for the Evolution Yu-Gi-Oh! platform: accounts, ranked play
and tiers, cosmetics, rewards, and moderation. Bun + ElysiaJS + TypeORM (PostgreSQL),
Hexagonal Architecture + DDD.

`docs/architecture.md` is the reference for stack versions, modules, routers, auth, the
error map, and the OpenAPI ratchet. `docs/operations.md`, `docs/rewards.md`, and
`docs/ranked-tiers.md` cover their topics.

## Skills

Skills live in `.agent/skills/`. Read the matching `SKILL.md` before acting:

| When you are... | Skill |
| --- | --- |
| Adding or changing a module, use case, repository, endpoint, migration, or test | [`evolution-api-modules`](.agent/skills/evolution-api-modules/SKILL.md) |
| Writing router code, guards, or TypeBox schemas | [`elysiajs`](.agent/skills/elysiajs/SKILL.md) |
| Checking how the game server produces match results or stats | [`evolution-server`](.agent/skills/evolution-server/SKILL.md) |

## Commands

The runtime is **Bun**, not Node.

```bash
bun run dev                       # watch-mode dev server (src/index.ts)
bun run src/worker.ts             # standalone rewards worker
bun test                          # all tests
bun test tests/unit/modules/rewards   # a folder or file
bun test -t "test name"           # tests matching a name
bun run lint                      # Biome check (lint + format)
bun run lint:fix                  # Biome autofix
bun run build                     # tsc type-check and emit to ./build
bun run migration:cosmetics:run   # API-owned migrations (src/migrations/)
bun run migration:cosmetics:revert
```

Before finishing a change, run the focused tests, then `bun test` and `bun run lint`.

## Critical rules

- **Two DataSources, one Postgres.** `src/cosmetics-data-source.ts` owns the API's tables
  (cosmetics, entitlements, loadout, rewards); its migrations live in `src/migrations/`
  and are tracked in `cosmetics_migrations`. `src/evolution-types/` is the game server's
  vendored shared schema (users, matches, stats, bans): do not edit its entities or
  migrations from this repo.
- **Dependency rule:** `infrastructure -> application -> domain`. Domain imports no
  framework or ORM code. Never return TypeORM or domain entities from a router; return
  use case results typed by TypeBox schemas.
- **Composition root:** `src/server/routes/*-router.ts` `new` up dependencies by hand (no
  DI container). Routers are mounted under `/api/v1` in `src/server/server.ts`.
- **Errors:** throw the classes in `src/shared/errors/`; `mapDomainErrorStatus` in
  `src/server/server.ts` maps them to status codes. Do not set status codes by hand. A
  plain `Error` answers 500.
- **New endpoints** must satisfy the OpenAPI ratchet test
  (`tests/unit/server/swagger/openapi-document.test.ts`); follow the checklist in
  `docs/architecture.md`.
- **Rewards worker:** the API runs it in-process when `REWARDS_WORKER_ENABLED=true`, and
  `src/worker.ts` runs it standalone. Instances share a lock, so only one makes progress
  at a time.
- **Config:** env vars are read and validated in `src/config/index.ts`. Never read or
  print `.env` values.

## Code style

- `camelCase` for variables and functions, `PascalCase` for classes and types, strict
  typing. Biome formats (tabs); do not hand-format against it.
- Tests use `bun:test` under `tests/unit/`, mirroring `src/` by layer.
- Commits follow Conventional Commits (commitlint, enforced via husky + lint-staged).
