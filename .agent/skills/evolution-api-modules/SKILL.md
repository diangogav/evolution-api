---
name: evolution-api-modules
description: How modules, use cases, repositories, routers, and tests are written in evolution-api (Hexagonal + DDD as practiced in this repo). Use before adding or changing a module, use case, endpoint, repository, or migration.
---

# Evolution API Modules

This skill describes the conventions the code already follows. When in doubt, copy
the `rewards` module (`src/modules/rewards/`): it is the most recent and most consistent
reference. Background tables (stack, routers, auth, error map, OpenAPI ratchet) live in
`docs/architecture.md`; read it instead of guessing.

## Module layout

Layers are flat folders, no sub-folders per pattern:

```
src/modules/<feature>/
  domain/          # types, factories, domain errors, repository/port interfaces
  application/     # one use case class per file
  infrastructure/  # *PostgresRepository, *Entity (TypeORM), *Schemas (TypeBox), workers
```

- Dependency rule: `infrastructure -> application -> domain`. `domain/` imports nothing
  from the other two layers and nothing from Elysia or TypeORM.
- A layer that has nothing to hold is omitted (`auth` has no `domain/`, `assets` and
  `points-ledger` have no `application/`). Do not create empty folders.
- A use case may depend on another module's port or use case (`ClaimMission` uses
  `GrantCosmeticToUser`); import the narrowest shape (`Pick<GrantCosmeticToUser, "runForUserId">`).

## Domain

- Model data as `type`s plus factory functions that validate and return the value
  (`essenceLedgerEntry()` in `rewards/domain/EssenceLedgerEntry.ts`). Use classes only
  when the object carries behavior.
- Closed sets are `as const` arrays with a derived union type (`ESSENCE_LEDGER_KINDS`).
- Invariant violations throw a module-specific `Error` subclass with a `name`.
- Ports are interfaces named `<Thing>Repository` / `<Thing>Source` / `TransactionRunner`.
- Pure rules are standalone functions (`evaluateMatch.ts`, `selectDailyMissions.ts`) and
  get their own unit tests.
- Comments explain the why (idempotency, races, ordering), not the what.

## Application (use cases)

- One class per file, named as a verb phrase: `ClaimMission`, `GetMyMissions`,
  `PurchaseCosmetic`.
- Dependencies are constructor parameters typed by domain ports, `private readonly`.
- The entry method is `run(input)`. `execute()` survives only in older `user`/`stats`
  code; do not use it for new use cases.
- Input/result are exported types next to the class (`ClaimMissionInput`,
  `ClaimMissionResult`). Never return TypeORM entities.
- Pass time in (`now: Date`) instead of calling `new Date()` inside the use case.
- Expected failures throw the shared errors from `src/shared/errors/`
  (`NotFoundError`, `ConflictError`, `UnprocessableError`, `ForbiddenError`,
  `InvalidArgumentError`, `AuthenticationError`, `PaymentRequiredError`).
  `mapDomainErrorStatus` in `src/server/server.ts` maps them to HTTP status codes. A plain
  `Error` becomes a 500. Never set status codes from a use case.
- Check existence yourself and throw `NotFoundError` instead of relying on
  `findOneOrFail`.
- Multi-write operations go through the `TransactionRunner` port.

## Infrastructure

- Repositories: `<Thing>PostgresRepository implements <Thing>Repository`. Raw SQL as
  module-level constants with `$n` parameters is common and fine; keep queries
  idempotent (`ON CONFLICT DO NOTHING`) where the domain requires it.
- Methods that can join a transaction take an optional `manager` (`QueryableManager`).
- TypeORM entities are `<Thing>Entity.ts` and stay in `infrastructure/`.
- HTTP response schemas are TypeBox in `<Thing>Schemas.ts` (`MissionSchemas.ts`).

## Data: pick the right DataSource

- Tables owned by this API (cosmetics, entitlements, loadout, rewards...) use
  `src/cosmetics-data-source.ts`; migrations go in `src/migrations/` and run with
  `bun run migration:cosmetics:run`.
- `src/evolution-types/` is the game server's shared schema (users, matches, stats,
  bans...). Read from it, never add or edit its entities or migrations from here.
- Foreign keys to shared tables (`users(id)`) are declared in raw SQL inside the cosmetics
  migration.

## Routers (composition root)

There is no DI container and, for most modules, no controller class. A
`src/server/routes/<feature>-router.ts` file:

1. `new`s up repositories and use cases at module top level.
2. Exports `new Elysia({ prefix: "/..." })` with `.use(bearer())` and, for authenticated
   player routes, `.guard(banGuard, (app) => ...)`. Admin routes use
   `JwtAdminAuthorizer` instead of `banGuard`.
3. Keeps handlers inline and thin: decode the JWT, call `useCase.run(...)`, return the
   result.
4. Declares `params`/`query`/`body` with `t.*` and a `detail` with `tags`, `summary`,
   `description`, `security`, and `responses` built from `jsonOk` / `emptyOk` /
   `errorResponses` (`src/server/openapi/responses.ts`).

Then mount the router in `mountApiV1Routes` (`src/server/server.ts`) and follow the
"Adding a new endpoint" checklist in `docs/architecture.md`. The OpenAPI ratchet test
(`tests/unit/server/swagger/openapi-document.test.ts`) fails if `PROTECTED_OPERATIONS`
or the tags are not updated.

Reference: `src/server/routes/missions-router.ts`.

## Tests

- `bun:test` only. Paths mirror the layer: `tests/unit/modules/<feature>/{domain,application,infrastructure}/<File>.test.ts`.
  Older folders use plural names (`tests/unit/modules/matches`, `users`); new modules use
  the same name as in `src/modules/`.
- Use cases are tested with hand-written fakes of their ports, not mocking libraries
  (`tests/unit/modules/rewards/application/ClaimMission.test.ts`).
- Assert the shared error class for failure paths (`expect(...).rejects.toThrow(NotFoundError)`).
- Run `bun test tests/unit/modules/<feature>` while iterating, then `bun test` and
  `bun run lint` before finishing.
