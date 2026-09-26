# Evolution API docs

This is the knowledge base for what the Swagger reference cannot express: system design, cross-cutting rules and domain concepts that span several endpoints.

**Swagger vs these pages.** The live Swagger UI documents the contract of each endpoint — path, parameters, request and response schemas, and which calls need a token. These pages document how the system is put together and why it behaves the way it does, so a change in one place doesn't surprise you in another.

Live Swagger: [`https://api.evolutionygo.com/swagger`](https://api.evolutionygo.com/swagger)

## Pages

| Page | Covers |
| --- | --- |
| [architecture.md](architecture.md) | Stack, module layout, composition root, data sources, error mapping, auth, external services, Swagger/OpenAPI, testing conventions |
| [ranked-tiers.md](ranked-tiers.md) | Client integration guide for the ranked tier system: endpoints, the `tier` object, ladder rules, rendering guidance |
| [domain/README.md](domain/README.md) | Index and glossary for the domain pages below |
| [domain/seasons-ranks-points.md](domain/seasons-ranks-points.md) | Seasons, ranks (ban lists, grouped ladders, Global), how season points and player of the week are computed |
| [domain/points-ledger-and-ratings.md](domain/points-ledger-and-ratings.md) | The points ledger, Elo ratings, provisional ratings and peaks, who writes what (this API vs the game server) |
| [domain/match-annulment.md](domain/match-annulment.md) | The annulment/reversal batch flow, per-game outcomes, the enable switch, idempotency |
| [domain/moderation.md](domain/moderation.md) | User bans: lifecycle, `banGuard`, admin-only routes, relation to annulment |
| [domain/cosmetics.md](domain/cosmetics.md) | Catalog, entitlements, loadout, signed asset URLs |
| [domain/tournaments.md](domain/tournaments.md) | Lightning tournaments: upstream service vs local ranking, the webhook, the proxy |
| [operations.md](operations.md) | Environment variables, running locally, migrations, seeds and scripts, deployment notes |
