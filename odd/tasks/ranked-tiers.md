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
- Active game: `applied - reversal + reinstatement > 0` per game_id; one net row per game at its original game time; replay order (game time, applied created_at, applied id); game time = min(duels.date) only for rows created before 2026-09-10, else applied created_at.
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

- [ ] 2.1 Port `src/modules/tiers/domain/TiersRepository.ts`: `findEligibleRanks`, `findTierGames`. (delegated)
- [ ] 2.2 RED `TiersPostgresRepository.test.ts` with `spyOn(dataSource, "query")`: ranks query (`name = ANY($1) AND type IN ('banlist','group')`), games CTE with kind-balance `HAVING`, conditional `CASE WHEN g.applied_at < $4` duels lookup, params `[userIds, rankIds, season, BACKFILL_CUTOFF]`, empty-input short circuit. (delegated)
- [ ] 2.3 GREEN `src/modules/tiers/infrastructure/TiersPostgresRepository.ts`. (delegated)
- [ ] 2.4 DTO `src/modules/tiers/application/dtos/TierView.ts` matching `TierViewSchema`. (delegated)
- [ ] 2.5 RED `TierResolver.test.ts` (fake repository): unknown/global rank absent; no rows means Rookie with 0 games; standing maps via `toTierView`; no Master yet. (delegated)
- [ ] 2.6 GREEN `src/modules/tiers/application/TierResolver.ts` `forPlayer`. (delegated)
- [ ] 2.7 Consumer port `src/modules/stats/application/TierLookup.ts` with `forPlayer` only. (delegated)
- [ ] 2.8 RED modify `UserStatsFinder.test.ts`: `ratings[].tier` from the fake lookup by banListName, `null` when absent, prior fields and order byte-identical. (delegated)
- [ ] 2.9 GREEN modify `UserStatsFinder.ts`: constructor takes `TierLookup`, attaches `tier` after `toJson()`. (delegated)
- [ ] 2.10 Wire `user-router.ts` (`new TierResolver(new TiersPostgresRepository())`) and update the Swagger example; no runtime response schema. (delegated)
- [ ] 2.11 PR2 gate: full gates plus the manual dev read check. (inline)

### Work unit 3 — PR3 leaderboard read path and Master (`feat/ranked-tiers-03-leaderboard-master`)

Focused command: `bun test tests/unit/modules/tiers/infrastructure/TiersPostgresRepository.test.ts tests/unit/modules/tiers/application/TierResolver.test.ts tests/unit/modules/stats/application/UserStatsLeaderboardGetter.test.ts`. Runtime harness: `GET /api/v1/stats?banListName=<rank>` against the read-only dev DB. Rollback: revert Master queries, `forLeaderboardPage`/`resolveMaster`, `TierLookup.forLeaderboardPage`, `UserStatsLeaderboardGetter.ts`, `leaderboard-router.ts`.

- [ ] 3.1 RED extend repository test: `findMasterCandidates` (player_stats, `wins + losses >= $3`, order points desc, win rate desc, user_id asc, `LIMIT $4 OFFSET $5`) and `findMasterRatings` (player_ratings by `user_id = ANY($3)`). (delegated)
- [ ] 3.2 Extend the `TiersRepository` port. (delegated)
- [ ] 3.3 GREEN implement both queries. (delegated)
- [ ] 3.4 RED extend `TierResolver.test.ts`: `forLeaderboardPage` map by userId; `resolveMaster` batches of 50, reuses replays, stops at 5, empty when exhausted, ratings only for Master ids; `forPlayer` resolves Master when the player is Platinum+ with >= 20 games. (delegated)
- [ ] 3.5 GREEN `forLeaderboardPage`, `resolveMaster`, Master wiring in `forPlayer`. (delegated)
- [ ] 3.6 Extend `TierLookup` with `forLeaderboardPage`. (delegated)
- [ ] 3.7 RED modify `UserStatsLeaderboardGetter.test.ts`: `tier` per row from the fake map by userId; order and fields byte-identical. (delegated)
- [ ] 3.8 GREEN modify `UserStatsLeaderboardGetter.ts`. (delegated)
- [ ] 3.9 Wire `leaderboard-router.ts` and update the Swagger example with one Master row. (delegated)
- [ ] 3.10 Security assertion: every repository query uses only positional `$n` parameters; tier-enriched routes keep the existing public access level. (delegated)
- [ ] 3.11 PR3 gate: full gates plus the manual dev read check (distribution and latency baselines). (inline)

### Work unit 4 — PR4 catalog endpoint (`feat/ranked-tiers-04-catalog`)

Focused command: `bun test tests/unit/modules/tiers/application/GetTierCatalog.test.ts tests/unit/server/routes/ranked-tiers-router.test.ts`. Runtime harness: `curl /api/v1/ranked-tiers` and `?banListName=TCG`. Rollback: delete router, use case, DTO; remove the `.use(rankedTiersRouter)` line.

- [ ] 4.1 RED `GetTierCatalog.test.ts`: wrapper `{ banListName, dailyOpponentCap, dayBoundary: "UTC", tiers }`, `banListName` echo, override reflection. (delegated)
- [ ] 4.2 GREEN `dtos/TierCatalogView.ts` and `GetTierCatalog.ts`. (delegated)
- [ ] 4.3 RED `tests/unit/server/routes/ranked-tiers-router.test.ts` via `rankedTiersRouter.handle(new Request(...))`: 200, seven tiers in order, `banListName` null and "TCG", no auth. (delegated)
- [ ] 4.4 GREEN `src/server/routes/ranked-tiers-router.ts` (prefix `/ranked-tiers`, tag `Leaderboard`, runtime `response: { 200: RankedTierCatalogSchema }`). (delegated)
- [ ] 4.5 Mount `.use(rankedTiersRouter)` in `src/server/server.ts`. (delegated)
- [ ] 4.6 PR4 gate: full gates plus the two curl checks. (inline)

### Follow-ups from the PR1 native review (advisory, non-blocking; land with work unit 2)

- [ ] F1 `TierGame.compareTierGames` compares `appliedId` as a string. `points_ledger.id` is a uuid, so lexical order equals Postgres uuid order; document that invariant in the code and add a tie-break test with realistic lowercase uuid-shaped ids. (delegated)
- [ ] F2 `replayTier` assumes at least one `absolute` tier in the ladder (`grantable[0]`); add a guard that throws a clear error (or narrow `TierOverrides` so `kind` cannot be overridden), with a RED test. (delegated)
- [ ] F3 Add a `MasterSelection` test where `grantedTierId` and `tierId` disagree with >= 20 games, proving eligibility uses the granted tier. (delegated)

### Final verification

- [ ] 5.1 Strict TDD evidence per PR: every GREEN commit preceded by its RED commit; list exceptions.
- [ ] 5.2 Threat-matrix N/A re-confirmation: parameterized SQL only, no auth added to public routes.
- [ ] 5.3 Manual dev SQL semantics check (read-only): conditional duels lookup and kind-balance agreement with `projectRating` on a known annulled and reinstated game.
- [ ] 5.4 Map spec success criteria to covering tests; open follow-ups for gaps.
- [ ] 5.5 Scope and budget containment per PR (`git diff --stat` against the merge base; no `src/migrations/`, `src/evolution-types/` or game-server files touched).

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
| 1.12 PR1 gate | inline | tree e8cca81 | `bun test tests/unit/modules/tiers/` 73 pass; `bun test` 368 pass / 0 fail / 68 files; `bun run lint` clean (1 pre-existing biome.json info); `bun run build` clean | authored 1387 lines (391 production, 996 tests); `size:exception` accepted by the user (#1215) |

## Delivery slices

| PR | Branch | Base | Commits | Authored lines | Status |
|----|--------|------|---------|----------------|--------|
| tracker | feat/ranked-tiers | main (6f8f57d) | | | created, not pushed |
| 1 | feat/ranked-tiers-01-domain | feat/ranked-tiers | ed93df9..9f93d2c (17 commits) | 1387 authored (391 prod) + odd doc | implemented; size:exception; native review approved and acknowledged; not pushed |
| 2 | feat/ranked-tiers-02-profile | feat/ranked-tiers-01-domain | | | pending |
| 3 | feat/ranked-tiers-03-leaderboard-master | feat/ranked-tiers-02-profile | | | pending |
| 4 | feat/ranked-tiers-04-catalog | feat/ranked-tiers-03-leaderboard-master | | | pending |

## Review (receipt-driven development)

| Commit | Assessed tier | Outcome |
|--------|---------------|---------|
| PR1 range ed93df9..9f93d2c (base feat/ranked-tiers 6f8f57d, candidate tree df04e438) | medium (`executable_change` MasterSelection.ts; `slice_budget_reached`) | consent granted by the user; lineage review-41b99773ceea9aa5, one lens (review-reliability), approved with 3 advisory findings, acknowledged (receipt consumed). Advisory findings became follow-ups F1-F3 below. |

## Next step

Work unit 2 (profile read path) on `feat/ranked-tiers-02-profile`, branched from the PR1 branch, including follow-ups F1-F3.
