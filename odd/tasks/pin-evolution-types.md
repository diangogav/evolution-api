# Pin evolution-types in the image (evolution-api audit step 4)
Objective: the Docker image uses exactly the evolution-types commit the submodule pins and the tests ran against, instead of whatever `main` is at build time. Branch `build/pin-evolution-types`, single PR, runner `bun test`.

## Specs
- S1 Bump the `src/evolution-types` submodule from `b8d138c` to `1f842d9` (evolution-types `main`, what production already builds with); the suite, `tsc` and the build pass against it.
- S2 The Dockerfile fetches evolution-types at the pinned commit (a build argument defaulting to the submodule SHA), not the default branch.
- S3 CI fails when the Dockerfile's pinned SHA and the submodule SHA differ, so bumping one without the other cannot ship.
- S4 Docs: `docs/operations.md` explains how to bump evolution-types; `AGENTS.md` and `docs/architecture.md` describe evolution-types as the schema package shared by evolution-api and EDOpro-server-ts, whose migrations run from the package itself (user correction, L2).

## Tasks
| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1 | inline | pending | |
| T2 | S2, S3, S4 | inline | pending | |
| T3 | S1–S4 (independent verification, risk item 5) | delegated verifier | pending | |

## Log
- L1 (2026-11-02, user, verbatim): "si" — to: "¿Arranco por el 1, el SHA en el Dockerfile?" after the step 4 proposal.
- L2 (2026-11-02, user, verbatim): "evoluti9on types y api definen las tablas el server importa evolution types y si". Verified: both evolution-api and EDOpro-server-ts vendor evolution-types as a submodule and clone its `main` in their Dockerfiles; its migrations run with the package's own `migration:run`. Pins: api `b8d138c`, server `6837dc3`, evolution-types `main` `1f842d9` (2026-10-28). Delta b8d138c..1f842d9 is additive: `MatchResumeEntity`/`UnrankedMatchEntity` client columns and the AddMatchClient and CreateReservedDuels migrations. The server repo has the same drift; out of scope here.
- L3 (2026-11-02, user, verbatim): "si" — to bumping the submodule first and then pinning the Dockerfile to it.
