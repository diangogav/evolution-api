# Feature: ranked-tiers

Engram mirror: topic `odd/ranked-tiers/tasks`, project `evolution-api`. Repository locator: `odd/tasks/ranked-tiers.md`.

## Objective

Expose a seven-level, Master Duel style tier (Rookie, Bronze, Silver, Gold, Platinum, Diamond, Master) per player, per rank (format ladder) and per season, derived at read time by evolution-api from `points_ledger`. Additive `tier` object on `GET /users/:userId/stats` ratings and on `GET /stats` rows, plus a public catalog endpoint `GET /api/v1/ranked-tiers`.

## Problem and why

Players only see net points and an Elo number. The mdpro3 client needs a readable progression badge with icons. Net points are farmable through arranged Discord sessions, so the tier must apply floors, a daily per-opponent cap and a distinct-opponent gate while staying a pure function of the ledger.

## Planning artifacts (authoritative, Engram project `evolution-api`)

- Proposal `sdd/ranked-tiers/proposal` #1195 (rev 3, Judgment Day approved, verdict #1198).
- Spec `sdd/ranked-tiers/spec` #1200 (rev 3): requirements and GIVEN/WHEN/THEN scenarios.
- Design `sdd/ranked-tiers/design` #1201: module layout, SQL, contracts, testing strategy, file lists.
- Task breakdown `sdd/ranked-tiers/tasks` #1204: full text of every task below.
- Product decisions (project `evolution`): #1194 ladder, #1197 no cache, #1202 spec/design alignment, #1207 ODD route.

## Scope

In: new `src/modules/tiers` module (domain, application, infrastructure), `TierLookup` port in `src/modules/stats/application`, additive `tier` in `UserStatsFinder` and `UserStatsLeaderboardGetter`, wiring in `user-router.ts` and `leaderboard-router.ts`, new `ranked-tiers-router.ts` mounted in `server.ts`, unit tests and fixtures.

Out: migrations, indexes, game-server changes, matchmaking, cache, icon assets, Global ladder, decay or shields, any change to `projectPlayerStats` or ledger write paths.

## Constraints

- Strict TDD: enabled. Source: `sdd-init/evolution-api` (#1189, workspace-level `bun test`). Runner: `bun test` (bun:test). Lint: `bun run lint` (Biome). Type check: `bun run build` (tsc). RED must be observed before GREEN; never invent evidence.
- Work-unit commits on the feature branch, Conventional Commits, tests with the behavior; per `work-unit-commits`, RED and GREEN of a task may be separate commits but are never mixed with unrelated work.
- Delivery: `ask-on-risk` resolved to chained PRs, chain strategy `feature-branch-chain`. Tracker `feat/ranked-tiers` from `main`; PR1 `feat/ranked-tiers-01-domain` -> tracker; PR2 `feat/ranked-tiers-02-profile` -> PR1 branch; PR3 `feat/ranked-tiers-03-leaderboard-master` -> PR2 branch; PR4 `feat/ranked-tiers-04-catalog` -> PR3 branch. Push, PR creation and merge are the user's decisions.
- Forecast (authored changed lines, additions plus deletions): PR1 ~680 (~270 prod), PR2 ~500, PR3 ~440, PR4 ~200; total ~1820. Each PR keeps production under 400 and relies on the project allowance for test excess up to 700.
- Receipt-driven development is on for this clone (default source). After each work-unit commit run `gentle-ai review assess --cwd <repo> --agent claude-code --base-ref <last reviewed boundary> --committed-only --json` and follow `review_due`.
- Untracked files at the repo root (`CLAUDE.md`, `.atl/`) are not part of this feature and must never be staged.
- Fixture sources: `tcg_s7_ledger.csv` and `edison_s7_ledger.csv` live outside the repo (session scratchpad); only anonymized slices with synthetic ids enter the repo.

## Rules summary (see spec #1200 for the full text)

- Rookie: fewer than 5 non-annulled games. Bronze < 3, Silver >= 3, Gold >= 10, Platinum >= 25, Diamond >= 40 effective points; Platinum and Diamond also require wins over >= 5 distinct opponents (all non-annulled games).
- Effective points: daily-capped sum (first 2 games per UTC day per opponent) that never drops below the highest granted tier threshold (`max(lockedFloor, effective + delta)`); floors lock only at grant.
- Active game: `applied - reversal + reinstatement > 0` per game_id; one net row per game at its original game time; replay order (game time, applied created_at, applied id); game time = min(duels.date) for every game, falling back to the applied created_at only when no duel row exists (the 2026-09-10 backfill cutoff was removed on 2026-09-25, decision #1227: it encoded the dev backfill date and would misorder production history).
- Master: strict top 5 eligible (>= 20 games AND Platinum reached) ordered by `player_stats.points` desc, win rate desc, user_id asc; empty when fewer than 5; only Master exposes rating and peak. Candidates come from player_stats in batches of 50; leaderboard replays only the page's users; no cache.
- Tiers only for ranks of type banlist and group. progress is `{ nextTierId, unit, current, target, distinctOpponentWins }` or null (Diamond, Master).

## Checklist

Route per task: `inline` (orchestrator, mechanical) or `delegated` (bounded writer). Check an item only after its outcome and checks were observed. Record commit ids under Evidence.

### Work unit 1 — PR1 domain (`feat/ranked-tiers-01-domain`)

Focused command: `bun test tests/unit/modules/tiers/domain/ tests/unit/modules/tiers/infrastructure/TierSchemas.test.ts`. Runtime harness: N/A (pure module, no HTTP surface yet). Rollback: delete `src/modules/tiers/**` and `tests/unit/modules/tiers/**`.

- [x] 1.1 Fixtures `tests/unit/modules/tiers/fixtures/season7Slices.ts`: five anonymized slices (Edison backfill burst with reversed duelAt; Edison same-day session vs one opponent; TCG Gold-then-losses floor; TCG >= 25 points with < 5 distinct opponents; one TCG game with and without reversal+reinstatement) plus a `tierGame()` builder. Synthetic ids only. (delegated)
- [x] 1.2 RED `TierCatalog.test.ts`: 7 entries in order, thresholds null/3/10/25/40, kinds, `ladderFor(rankName)` overrides. (delegated)
- [x] 1.3 GREEN `src/modules/tiers/domain/TierCatalog.ts`: types, `TIER_CATALOG`, `ladderFor`, constants `DAILY_OPPONENT_CAP=2`, `ROOKIE_MIN_GAMES=5`, `MASTER_MIN_GAMES=20`, `MASTER_SIZE=5`, `DISTINCT_OPPONENT_WINS=5`. (delegated)
- [x] 1.4 RED `TierGame.test.ts`: `compareTierGames` order, `gameTime` cutoff rule, `utcDay` at a day boundary; uses the backfill-burst slice. (delegated)
- [x] 1.5 GREEN `src/modules/tiers/domain/TierGame.ts`: `TierGame`, `BACKFILL_CUTOFF` ("2026-09-10 00:00:00"), `BACKFILL_CUTOFF_MS`, `gameTime`, `compareTierGames`, `utcDay`. (delegated)
- [x] 1.6 RED `TierReplay.test.ts`: Rookie minimum; threshold boundaries 2/3/9/10/24/25/39/40; floors lock only at grant and hold; Platinum gate blocked caps at Gold; 3-3 same-day session; new UTC day resets the cap; cross-day win-trading stays Gold; progress objects; annul/reinstate as present/absent row; null opponent. (delegated)
- [x] 1.7 GREEN `src/modules/tiers/domain/TierReplay.ts`: `TierStanding`, `TierProgress`, `replayTier(games, ladder)`. (delegated)
- [x] 1.8 RED `MasterSelection.test.ts`: eligibility, strict top 5, boundary tie never expands, fewer than 5 gives empty. (delegated)
- [x] 1.9 GREEN `src/modules/tiers/domain/MasterSelection.ts`: `MasterCandidate`, `isMasterEligible`, `selectMaster`. (delegated)
- [x] 1.10 RED `tests/unit/modules/tiers/infrastructure/TierSchemas.test.ts`: `Value.Check` on Master/Gold/Diamond views and the default catalog payload. (delegated)
- [x] 1.11 GREEN `src/modules/tiers/infrastructure/TierSchemas.ts`: `TierIdSchema`, `TierProgressSchema`, `TierViewSchema`, `TierDefinitionSchema`, `RankedTierCatalogSchema`. (delegated)
- [x] 1.12 PR1 gate: `bun test`, `bun run lint`, `bun run build`; diff near ~270 prod / ~410 test; every GREEN commit preceded by its RED commit. (inline)

### Work unit 2 — PR2 profile read path (`feat/ranked-tiers-02-profile`)

Focused command: `bun test tests/unit/modules/tiers/infrastructure/TiersPostgresRepository.test.ts tests/unit/modules/tiers/application/TierResolver.test.ts tests/unit/modules/stats/application/UserStatsFinder.test.ts`. Runtime harness: `GET /api/v1/users/:userId/stats` against the read-only dev DB. Rollback: revert repository, resolver, `TierView`, `TierLookup`, `UserStatsFinder`, `user-router.ts` wiring.

- [x] 2.1 Port `src/modules/tiers/domain/TiersRepository.ts`: `findEligibleRanks`, `findTierGames`. (delegated)
- [x] 2.2 RED `TiersPostgresRepository.test.ts` with `spyOn(dataSource, "query")`: ranks query (`name = ANY($1) AND type IN ('banlist','group')`), games CTE with kind-balance `HAVING`, conditional `CASE WHEN g.applied_at < $4` duels lookup, params `[userIds, rankIds, season, BACKFILL_CUTOFF]`, empty-input short circuit. (delegated)
- [x] 2.3 GREEN `src/modules/tiers/infrastructure/TiersPostgresRepository.ts`. (delegated)
- [x] 2.4 DTO `src/modules/tiers/application/dtos/TierView.ts` matching `TierViewSchema`. (delegated)
- [x] 2.5 RED `TierResolver.test.ts` (fake repository): unknown/global rank absent; no rows means Rookie with 0 games; standing maps via `toTierView`; no Master yet. (delegated)
- [x] 2.6 GREEN `src/modules/tiers/application/TierResolver.ts` `forPlayer`. (delegated)
- [x] 2.7 Consumer port `src/modules/stats/application/TierLookup.ts` with `forPlayer` only. (delegated)
- [x] 2.8 RED modify `UserStatsFinder.test.ts`: `ratings[].tier` from the fake lookup by banListName, `null` when absent, prior fields and order byte-identical. (delegated)
- [x] 2.9 GREEN modify `UserStatsFinder.ts`: constructor takes `TierLookup`, attaches `tier` after `toJson()`. (delegated)
- [x] 2.10 Wire `user-router.ts` (`new TierResolver(new TiersPostgresRepository())`) and update the Swagger example; no runtime response schema. (delegated)
- [x] 2.11 PR2 gate: full gates plus the manual dev read check. (inline)

### Work unit 3 — PR3 leaderboard read path and Master (`feat/ranked-tiers-03-leaderboard-master`)

Focused command: `bun test tests/unit/modules/tiers/infrastructure/TiersPostgresRepository.test.ts tests/unit/modules/tiers/application/TierResolver.test.ts tests/unit/modules/stats/application/UserStatsLeaderboardGetter.test.ts`. Runtime harness: `GET /api/v1/stats?banListName=<rank>` against the read-only dev DB. Rollback: revert Master queries, `forLeaderboardPage`/`resolveMaster`, `TierLookup.forLeaderboardPage`, `UserStatsLeaderboardGetter.ts`, `leaderboard-router.ts`.

- [x] 3.1 RED extend repository test: `findMasterCandidates` (player_stats, `wins + losses >= $3`, order points desc, win rate desc, user_id asc, `LIMIT $4 OFFSET $5`) and `findMasterRatings` (player_ratings by `user_id = ANY($3)`). (delegated)
- [x] 3.2 Extend the `TiersRepository` port. (delegated)
- [x] 3.3 GREEN implement both queries. (delegated)
- [x] 3.4 RED extend `TierResolver.test.ts`: `forLeaderboardPage` map by userId; `resolveMaster` batches of 50, reuses replays, stops at 5, empty when exhausted, ratings only for Master ids; `forPlayer` resolves Master when the player is Platinum+ with >= 20 games. (delegated)
- [x] 3.5 GREEN `forLeaderboardPage`, `resolveMaster`, Master wiring in `forPlayer`. (delegated)
- [x] 3.6 Extend `TierLookup` with `forLeaderboardPage`. (delegated)
- [x] 3.7 RED modify `UserStatsLeaderboardGetter.test.ts`: `tier` per row from the fake map by userId; order and fields byte-identical. (delegated)
- [x] 3.8 GREEN modify `UserStatsLeaderboardGetter.ts`. (delegated)
- [x] 3.9 Wire `leaderboard-router.ts` and update the Swagger example with one Master row. (delegated)
- [x] 3.10 Security assertion: every repository query uses only positional `$n` parameters; tier-enriched routes keep the existing public access level. (delegated)
- [x] 3.11 PR3 gate: full gates plus the manual dev read check (distribution and latency baselines). (inline)

### Work unit 4 — PR4 catalog endpoint (`feat/ranked-tiers-04-catalog`)

Focused command: `bun test tests/unit/modules/tiers/application/GetTierCatalog.test.ts tests/unit/server/routes/ranked-tiers-router.test.ts`. Runtime harness: `curl /api/v1/ranked-tiers` and `?banListName=TCG`. Rollback: delete router, use case, DTO; remove the `.use(rankedTiersRouter)` line.

- [x] 4.1 RED `GetTierCatalog.test.ts`: wrapper `{ banListName, dailyOpponentCap, dayBoundary: "UTC", tiers }`, `banListName` echo, override reflection. (delegated)
- [x] 4.2 GREEN `dtos/TierCatalogView.ts` and `GetTierCatalog.ts`. (delegated)
- [x] 4.3 RED `tests/unit/server/routes/ranked-tiers-router.test.ts` via `rankedTiersRouter.handle(new Request(...))`: 200, seven tiers in order, `banListName` null and "TCG", no auth. (delegated)
- [x] 4.4 GREEN `src/server/routes/ranked-tiers-router.ts` (prefix `/ranked-tiers`, tag `Leaderboard`, runtime `response: { 200: RankedTierCatalogSchema }`). (delegated)
- [x] 4.5 Mount `.use(rankedTiersRouter)` in `src/server/server.ts`. (delegated)
- [x] 4.6 PR4 gate: full gates plus the two curl checks. (inline)

### Follow-ups from the PR1 native review (advisory, non-blocking; land with work unit 2)

- [x] F1 `TierGame.compareTierGames` compares `appliedId` as a string. `points_ledger.id` is a uuid, so lexical order equals Postgres uuid order; document that invariant in the code and add a tie-break test with realistic lowercase uuid-shaped ids. (delegated)
- [x] F2 `replayTier` assumes at least one `absolute` tier in the ladder (`grantable[0]`); add a guard that throws a clear error (or narrow `TierOverrides` so `kind` cannot be overridden), with a RED test. (delegated)
- [x] F3 Add a `MasterSelection` test where `grantedTierId` and `tierId` disagree with >= 20 games, proving eligibility uses the granted tier. (delegated)

### Follow-ups from the PR2 native review (advisory, non-blocking; land with work unit 3)

- [x] F4 `UserStatsFinder.test.ts:106`: the `rejects` expectation is not awaited, so the "tier lookup not called on NotFound" assertion is vacuous; await the rejection before asserting. (delegated)
- [x] F5 Recorded decision, no code change: `GET /users/:userId/stats` now fails when tier resolution fails (design failure policy: errors propagate, no silent `null`). Revisit only with production evidence. SQL semantics remain covered by the manual dev harness (repository convention: tests assert SQL text, no DB integration layer). (inline)

### Follow-ups from the PR3 native review (advisory, non-blocking; land with work unit 4)

- [x] F6 `TierResolver.resolveMaster` has no upper bound on candidate batches: in a rank with many 20+-game players but fewer than five Platinum+ players it replays every candidate on each eligible request. Bound the scan (e.g. `MASTER_CANDIDATE_MAX_BATCHES = 3`, 150 candidates ordered by points) and return an empty Master set beyond it; RED test with 200 candidates and no Platinum player. (delegated)
- [x] F7 Candidate batches use LIMIT/OFFSET without a shared snapshot; a concurrent update can skip or repeat a user. Deduplicate candidate ids across batches by userId before replay and seating; RED test where batch 2 repeats a batch-1 id. (delegated)
- [x] F8 `findMasterCandidates`: add `NULLS LAST` to `win_rate DESC` (or assert the order in the repository test) so zero-game rows never sort ahead when `minGames` is 0. (delegated)

### Final verification

- [x] 5.1 Strict TDD evidence per PR: every GREEN commit preceded by its RED commit; list exceptions.
- [x] 5.2 Threat-matrix N/A re-confirmation: parameterized SQL only, no auth added to public routes.
- [x] 5.3 Manual dev SQL semantics check (read-only): conditional duels lookup and kind-balance agreement with `projectRating` on a known annulled and reinstated game.
- [x] 5.4 Map spec success criteria to covering tests; open follow-ups for gaps.
- [x] 5.5 Scope and budget containment per PR (`git diff --stat` against the merge base; no `src/migrations/`, `src/evolution-types/` or game-server files touched).

## Acceptance criteria

- Profile and leaderboard carry the additive `tier` object; all existing fields and ordering unchanged.
- Catalog endpoint returns the seven tiers unauthenticated.
- Domain tests cover every spec scenario listed in the checklist.
- No migrations, no game-server changes, no cache.
- Tier distribution on dev TCG season 7 roughly matches Rookie 45%, Bronze 25%, Silver 16%, Gold 10%, Platinum 2%, Diamond 2%.

## Progress and evidence

| Task | Route | Commit | Focused check | Notes |
|------|-------|--------|---------------|-------|
| 1.1 fixtures | delegated | e1b373f (with 1.4 RED), ecdbd76 | used by 1.4/1.6/1.8 tests | five anonymized slices; slice 4 synthesized (no real TCG player is point-rich and opponent-poor) |
| 1.2 / 1.3 TierCatalog | delegated | RED 465e094, GREEN f1da570 | `bun test tests/unit/modules/tiers/domain/TierCatalog.test.ts` 9 pass | `ladderFor(rankName?, catalog = TIER_CATALOG)` takes an optional catalog for override tests |
| 1.4 / 1.5 TierGame | delegated | RED e1b373f, GREEN 67d3a76 | `.../TierGame.test.ts` 9 pass | |
| 1.6 / 1.7 TierReplay | delegated | RED ecdbd76, 4709d71 (superseded), GREEN 61ed540; correction RED 9df7a86, 91de1df, GREEN e8cca81 | `.../TierReplay.test.ts` 35 pass | effective points may go negative before the first grant (decision #1212); zero clamp reverted |
| 1.8 / 1.9 MasterSelection | delegated | RED a2682bf, GREEN 2b597c1 | `.../MasterSelection.test.ts` 10 pass | |
| 1.10 / 1.11 TierSchemas | delegated | RED 324ac6c, GREEN 935ab54, typing fix fe25e53 (test-only) | `.../infrastructure/TierSchemas.test.ts` 10 pass | `@sinclair/typebox/value` resolves through Elysia, no new dependency |
| F1 uuid tie-break doc + test | delegated | 8500b8d (characterization test), fbb91b3 (doc) | `TierGame.test.ts` 10 pass | no behavior change; points_ledger.id is uuid so lexical order = Postgres order |
| F2 ladder guard | delegated | RED ad8af21, GREEN 9083b7f | `TierReplay.test.ts` 36 pass | clear Error when a ladder has no absolute tier |
| F3 Master granted-vs-current | delegated | 57ba72e (characterization test) | `MasterSelection.test.ts` 11 pass | |
| 2.1-2.3 TiersRepository port + Postgres repo | delegated | RED 1cd5c44, GREEN 5806b16 | repository test 6 pass | design SQL verbatim; params `[userIds, rankIds, season, BACKFILL_CUTOFF]` |
| 2.4-2.6 TierView + TierResolver.forPlayer | delegated | RED 8c00ae7, GREEN 82addc2 | resolver test 7 pass | no Master yet |
| 2.7-2.9 TierLookup + UserStatsFinder | delegated | RED 657cd1c, GREEN fb6c713 | finder test 6 pass | tier attached after toJson(); errors propagate |
| 2.10 user-router wiring + Swagger | delegated | 742d1af | tsc + full suite | no runtime response schema |
| 2.11 PR2 gate | inline | tree 742d1af | module + finder tests 95 pass; `bun test` 387 pass / 0 fail / 70 files; lint clean (1 pre-existing info); tsc clean. Runtime harness against the read-only dev DB (API on :3102 vs main on :3101): profile of a 50-game TCG player identical apart from `tier`, same ratings order; tiers TCG group Gold (eff 10, 50 games, 17 opponents beaten), 2026.05 TCG Gold, 2026.09 TCG Rookie (eff -2, 3 games), Traditional Rookie. Latency: main 330 ms vs PR2 635 ms from the dev workstation, explained by 2 extra round trips (ranks 0.1 ms, games query 5.7 ms server-side for 102 games across 5 ranks); expected +10-20 ms colocated | authored 716 lines (255 production, 461 tests), 16 over the 700 test-excess allowance |
| F4 await NotFound rejection | delegated | 1a0c296 | finder test 6 pass | no RED constructible: on Bun 1.3.14 the un-awaited `.rejects` already drained microtasks; awaited anyway for runner independence (#1218) |
| 3.1-3.3 Master queries | delegated | RED 02f243c, GREEN ac8ee90 | repository test 10 pass | `findMasterCandidates` (player_stats, wins+losses >= $3, points desc, win_rate desc, user_id asc, LIMIT/OFFSET), `findMasterRatings` |
| 3.4-3.5 forLeaderboardPage + resolveMaster | delegated | RED 41a92dc (+b30f5d0 typing), GREEN 35473ed | resolver test 21 pass | batches of 50, replay reuse, early stop, empty when exhausted, ratings only for seated ids |
| 3.6-3.8 TierLookup.forLeaderboardPage + getter | delegated | RED f31082b, GREEN feeea54 | getter test 5 pass | tier per row keyed by userId; order and fields unchanged |
| 3.9 leaderboard-router wiring + Swagger Master row | delegated | 598459b | tsc clean | |
| 3.10 positional-binding + no-auth assertion | delegated | 65cd26a (+e67399b finder fake) | repository test 11 pass | sentinel injection values never appear in SQL; placeholders exactly $1..$n; no guard on either route |
| 3.11 PR3 gate | inline | tree e67399b | module + stats tests 119 pass; `bun test` 410 pass / 0 fail / 70 files; lint clean (1 pre-existing info); tsc clean. Runtime harness vs read-only dev DB (PR3 :3103 vs main :3101), TCG season 7 pages 1-3: responses identical apart from `tier`, order unchanged, 248 rows; distribution Rookie 45% / Bronze 25% / Silver 14% / Gold 12% / Platinum 2% / Master 2% (5 Masters with rating and peak: 90, 69, 63, 37, 34 points), matching the accepted simulation. Latency from the workstation: page 1 main 0.23 s vs PR3 1.4-1.7 s (6 queries: base, ranks, page games, candidates, unseen-candidate games, ratings = 5 extra round trips), page 3 main 0.14 s vs PR3 0.58 s; server-side cost measured earlier (page-1 games 89 ms), expected +150-250 ms colocated | authored 929 lines (317 production, 612 tests), 229 over the 700 allowance |
| F6 bounded Master scan | delegated | RED 39e7fd0, GREEN 8f0ab29 | resolver test 23 pass | `MASTER_CANDIDATE_MAX_BATCHES = 3`; 200 candidates without Platinum -> offsets [0, 50, 100], empty Master |
| F7 candidate dedupe across batches | delegated | RED e5012c0, GREEN 07be164 | resolver test 24 pass | `considered` set before replay and seating |
| F8 NULLS LAST | delegated | RED 9af95fc, GREEN 2624def | repository test 11 pass | `win_rate DESC NULLS LAST` |
| 4.1-4.2 GetTierCatalog + TierCatalogView | delegated | RED 7e84039, GREEN 75f3df6 | use case test 4 pass | overrides applied server-side, never exposed; explicit field mapping |
| 4.3-4.5 ranked-tiers-router + mount | delegated | RED 6179b29, GREEN b2f6fbf (+034bb0e test typing) | router test 3 pass | runtime `response: { 200: RankedTierCatalogSchema }`; Swagger example generated from the use case |
| 4.6 PR4 gate | inline | tree 034bb0e | module + router tests 118 pass; `bun test` 420 pass / 0 fail / 72 files; lint clean (1 pre-existing info); tsc clean. Runtime against dev (:3104): `GET /api/v1/ranked-tiers` 200 in <1 ms, `?banListName=TCG` 200 echoing "TCG", bogus Authorization header still 200 (public), wrapper keys banListName/dailyOpponentCap(2)/dayBoundary(UTC)/tiers, seven tiers in ladder order with kinds placement/absolute/relative and thresholds null/null/3/10/25/40/null. Leaderboard page 1 with the bounded scan still seats the same 5 Masters (ratings 1212, 1226, 1128, 1142, 1199) | authored 349 lines (134 production, 215 tests), within budget |
| 1.12 PR1 gate | inline | tree e8cca81 | `bun test tests/unit/modules/tiers/` 73 pass; `bun test` 368 pass / 0 fail / 68 files; `bun run lint` clean (1 pre-existing biome.json info); `bun run build` clean | authored 1387 lines (391 production, 996 tests); `size:exception` accepted by the user (#1215) |

## Delivery slices

| PR | Branch | Base | Commits | Authored lines | Status |
|----|--------|------|---------|----------------|--------|
| tracker | feat/ranked-tiers | main (6f8f57d) | | | created, not pushed |
| 1 | feat/ranked-tiers-01-domain | feat/ranked-tiers | ed93df9..d13831c (18 commits) | 1387 authored (391 prod) + odd doc | PR #85; size:exception; native review approved and acknowledged |
| 2 | feat/ranked-tiers-02-profile | feat/ranked-tiers-01-domain | 8500b8d..7c5d199 (17 commits) | 711 authored (255 prod) after the cutoff removal (f0e1143 test, 5221c51 refactor, net -5) | PR #86; earlier receipt superseded by the new candidate; native review pending again |
| 3 | feat/ranked-tiers-03-leaderboard-master | feat/ranked-tiers-02-profile | 13 commits rebased onto the new PR2 tip (38caea1) | 929 authored (317 prod); `size:exception` accepted by the user | PR #87; receipt superseded by the rebase; native review pending again |
| 4 | feat/ranked-tiers-04-catalog | feat/ranked-tiers-03-leaderboard-master | 13 commits rebased onto the new PR3 tip | 349 authored (134 prod) | PR #88; under budget |

## Review (receipt-driven development)

| Commit | Assessed tier | Outcome |
|--------|---------------|---------|
| PR1 range ed93df9..9f93d2c (base feat/ranked-tiers 6f8f57d, candidate tree df04e438) | medium (`executable_change` MasterSelection.ts; `slice_budget_reached`) | consent granted by the user; lineage review-41b99773ceea9aa5, one lens (review-reliability), approved with 3 advisory findings, acknowledged (receipt consumed). Advisory findings became follow-ups F1-F3 below. |
| PR2 range 8500b8d..74f6c7c (base feat/ranked-tiers-01-domain, candidate tree 21c791c7) | medium (`executable_change` TierLookup.ts; `slice_budget_reached`) | consent granted by the user; lineage review-43c1dec7b2867ca3, one lens (review-reliability), approved with 3 advisory findings, acknowledged (receipt consumed). Follow-ups F4-F5 below. |
| PR3 range 1a0c296..29c818a (base feat/ranked-tiers-02-profile, candidate tree 98a827b3) | medium (`executable_change` TierLookup.ts; `slice_budget_reached`) | consent granted by the user; lineage review-609080ce051bb6e0, one lens (review-reliability), approved with 3 advisory findings, acknowledged (receipt consumed). Follow-ups F6-F8 below. |
| PR4 range 39e7fd0..447425c (base feat/ranked-tiers-03-leaderboard-master) | medium (`executable_change` GetTierCatalog.ts) | `review_due: false`, reason `under_budget` (377 changed lines): stays pending in the slice per ODD; no review started, no receipt. Ordinary repository policy applies at delivery. |

## Final verification evidence

- 5.1 Strict TDD: every `feat`/`fix` commit in the chain is preceded by its `test` commit (see `git log --reverse feat/ranked-tiers..feat/ranked-tiers-04-catalog`). Exceptions, all documented: wiring commits 742d1af and 598459b (composition roots, covered by tsc and the full suite), characterization tests 8500b8d, 57ba72e, 65cd26a and 1a0c296 (pin existing behavior; no RED constructible without a regression), test-only typing fixes fe25e53, b30f5d0, e67399b, 034bb0e.
- 5.2 Threat matrix N/A re-confirmed: the repository test drives sentinel injection values through all queries and asserts placeholders `$1..$n` only; `leaderboard-router.ts` and `ranked-tiers-router.ts` declare no guard; `/:userId/stats` is registered before `bearer()` and `guard(banGuard)` in `user-router.ts`.
- 5.3 Manual dev SQL semantics (read-only): season 7 has 156 games with two reversals and one reinstatement (annulled, reinstated, annulled again) and the kind-balance rule classifies them as annulled (balance 0); ledger game counts agree with `rating_history`'s applied-minus-reversal-plus-reinstatement arithmetic on 796 of 800 (user, rank) keys; the 4 disagreements are 2 players x 2 ranks with exactly one ledger game that never received a rating row (rating eligibility, pre-existing data difference, not a tier defect: tiers count ledger games by spec). Conditional duels lookup confirmed in the query text and by the season-7 profile latency measurements.
- 5.4 Spec success criteria to tests: profile `tier` -> UserStatsFinder.test.ts + harness 2.11; leaderboard `tier` and ordering -> UserStatsLeaderboardGetter.test.ts + harness 3.11; catalog -> TierCatalog.test.ts, GetTierCatalog.test.ts, ranked-tiers-router.test.ts + harness 4.6; ladder rules -> TierReplay.test.ts, TierGame.test.ts; Master -> MasterSelection.test.ts, TierResolver.test.ts; annulment visible on next read -> no cache exists, harness 3.11/5.3; no migrations or game-server changes -> 5.5. No gap found.
- 5.5 Scope and budget: every PR diff stays inside `src/modules/tiers/**`, the three stats application files, the three routers, `server.ts`, tests and the feature document; nothing under `src/migrations/` or `src/evolution-types/`. Authored lines: PR1 1387 (size:exception), PR2 716 (accepted), PR3 929 (size:exception), PR4 349. Final tree: `bun test` 420 pass / 0 fail / 72 files, `bun run lint` clean (1 pre-existing info), `bun run build` clean.

## Next step

Implementation complete on four local branches (nothing pushed). Hand-off to the user: push the tracker `feat/ranked-tiers` and the four child branches, open the draft tracker PR to `main` and the four chained PRs (PR1 -> tracker, PR2 -> PR1, PR3 -> PR2, PR4 -> PR3) with Chain Context sections and the recorded size exceptions; the `chained-pr` and `branch-pr` skills apply. Follow-ups outside this feature: icon assets in evolution-assets, `merge-duplicate-ranks.sql` ledger fix (Engram #1203), optional `(rank_id, season)` index and cache only with production evidence.
