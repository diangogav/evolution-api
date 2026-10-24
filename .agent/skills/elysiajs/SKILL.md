---
name: elysiajs
description: ElysiaJS API reference for this repo (routing, TypeBox validation, guards, lifecycle, plugins, testing). Use when writing or changing routers, guards, or request/response schemas.
---

# ElysiaJS

For the latest API, consult [elysiajs.com/llms.txt](https://elysiajs.com/llms.txt).
For how this repo wires Elysia (composition root, guards, OpenAPI helpers), read the
`evolution-api-modules` skill first: its conventions win over generic Elysia advice.

## Project overrides

Generic Elysia guides recommend things this repo does not do:

| Generic advice | This repo |
| --- | --- |
| MVC folders (`index.ts` / `service.ts` / `model.ts`) | Hexagonal modules + `src/server/routes/*-router.ts` |
| `return status(404, ...)` or `return Error` from services | `throw` a class from `src/shared/errors/`; `onError` in `server.ts` maps it |
| `@elysiajs/jwt` | `src/shared/JWT.ts` (jsonwebtoken) + `@elysiajs/bearer` |
| `@elysiajs/openapi` | `@elysiajs/swagger` (`src/server/swagger.ts`) |
| Zod/Valibot | TypeBox (`t.*`) only |

## Core rules

- **Chain everything.** Each method returns a new type; breaking the chain loses types.
  ```ts
  new Elysia().state("build", 1).get("/", ({ store }) => store.build)
  ```
- **Inline handlers.** Keep the handler inline and call the use case from it, so context
  types infer: `({ bearer, params }) => claimMission.run({ ... })`.
- **Order matters.** Hooks apply only to routes registered after them.
- **Encapsulation.** Hooks are `local` by default; `{ as: "scoped" }` or
  `{ as: "global" }` widens them. Plugins re-run on every `.use` unless named
  (`new Elysia({ name: "ip" })`).
- **Guards** apply hooks/schemas to a group of routes:
  ```ts
  new Elysia({ prefix: "/me/missions" })
    .use(bearer())
    .guard(banGuard, (app) => app.get("/", handler, { query: t.Object({ ... }) }))
  ```
- **Validation.** Declare `params`, `query`, `body`, and `response` with `t.*`; Elysia
  answers `422` on invalid input before the handler runs. Derive types with
  `typeof Schema.static`.

## Resources

- `references/route.md`: routing, handlers, context (start here).
- `references/validation.md`: TypeBox rules and custom validators.
- `references/lifecycle.md`: `onRequest`, `beforeHandle`, `onError`, etc.
- `references/plugin.md`: splitting an instance into plugins, scoping.
- `references/macro.md`: reusable schema/lifecycle bundles.
- `references/testing.md`: testing an instance with `app.handle(new Request(...))`.
- `plugins/bearer.md`, `plugins/cors.md`: the two Elysia plugins the API uses.
- `examples/`: `basic.ts`, `schema.ts`, `guard.ts`, `error.ts`, `upload-file.ts`
  (upstream examples; `error.ts` shows Elysia's own error style, see overrides above).
