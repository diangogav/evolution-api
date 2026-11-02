# Pin evolution-types in the image (evolution-api audit step 4)
Objective: the tests run against the evolution-types commit the image ships (its `main`), and the docs describe evolution-types as shared. The image keeps cloning `main` (user decision, L5). Branch `build/pin-evolution-types`, single PR, runner `bun test`.

## Specs
- S1 Bump the `src/evolution-types` submodule from `b8d138c` to `1f842d9` (evolution-types `main`, what production already builds with); the suite, `tsc` and the build pass against it.
- S2 Dropped (L5): the Dockerfile keeps cloning evolution-types `main`.
- S3 Dropped (L5): no CI check comparing the Dockerfile and the submodule.
- S4 Docs: `docs/operations.md` explains how to bump evolution-types and that the submodule should track `main`, which the image clones; `AGENTS.md` and `docs/architecture.md` describe evolution-types as the schema package shared by evolution-api and EDOpro-server-ts, whose migrations run from the package itself (user correction, L2).

## Tasks
| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1 | inline | done | 22d4440; suite 1205/0, tsc 0, build OK against 1f842d9 |
| T2 | S4 | inline | done | docs only; the S2/S3 work (ARG pin + CI check, image built and verified with 1f842d9 and with `--build-arg ...=main`) was reverted per L5 |
| T3 | S1, S4 (independent verification, risk item 5: dependency bump) | delegated verifier | done | PASS: delta additive (3 nullable client columns, 2 migrations, 0 deletions); only MatchPostgresRepository uses the touched entities; suite 1205/0; Dockerfile and .github unchanged vs main |

## Log
- L1 (2026-11-02, user, verbatim): "si" — to: "¿Arranco por el 1, el SHA en el Dockerfile?" after the step 4 proposal.
- L2 (2026-11-02, user, verbatim): "evoluti9on types y api definen las tablas el server importa evolution types y si". Verified: both evolution-api and EDOpro-server-ts vendor evolution-types as a submodule and clone its `main` in their Dockerfiles; its migrations run with the package's own `migration:run`. Pins: api `b8d138c`, server `6837dc3`, evolution-types `main` `1f842d9` (2026-10-28). Delta b8d138c..1f842d9 is additive: `MatchResumeEntity`/`UnrankedMatchEntity` client columns and the AddMatchClient and CreateReservedDuels migrations. The server repo has the same drift; out of scope here.
- L3 (2026-11-02, user, verbatim): "si" — to bumping the submodule first and then pinning the Dockerfile to it.
- L4 (2026-11-02, user, verbatim): "pero si ponemos el sa directo en dockerfile pierdo flexibilidad". Answered: the SHA was a build-arg default and `--build-arg EVOLUTION_TYPES_SHA=main` restored today's behavior (verified by building both images); the real rigidity was keeping two pins in sync.
- L5 (2026-11-02, user, verbatim): "dejalo siempre con main". Dockerfile and CI changes reverted; S2 and S3 dropped. Residual risk accepted by the user: an image build can pick up evolution-types commits newer than the submodule the tests ran against.
- L6 (2026-11-02): T3 verifier PASS. Advisories left as is: docs/architecture.md:5 says the tournament tables "belong to the game server" (who uses them, not who migrates); docs/design/halloween-event-runs.md:78 is a historical design record.
