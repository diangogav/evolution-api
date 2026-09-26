# Evolution API docs

This is the knowledge base for what the Swagger reference cannot express: system design, cross-cutting rules and domain concepts that span several endpoints.

**Swagger vs these pages.** The live Swagger UI documents the contract of each endpoint — path, parameters, request and response schemas, and which calls need a token. These pages document how the system is put together and why it behaves the way it does, so a change in one place doesn't surprise you in another.

Live Swagger: [`https://api.evolutionygo.com/swagger`](https://api.evolutionygo.com/swagger)

## Pages

| Page | Covers |
| --- | --- |
| [architecture.md](architecture.md) | Stack, module layout, composition root, data sources, error mapping, auth, external services, Swagger/OpenAPI, testing conventions |
| [ranked-tiers.md](ranked-tiers.md) | Client integration guide for the ranked tier system: endpoints, the `tier` object, ladder rules, rendering guidance |

Domain and operations pages are being added.
