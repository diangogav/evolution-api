# Rewards: essence, missions and the shop

Players earn **essence** by playing and spend it on cosmetics. This page covers the parts Swagger cannot: where essence comes from, how missions are chosen and tracked, how the worker turns match results into progress, and how to operate it. Endpoint contracts live in Swagger under the `Rewards` tag.

## Essence

Essence is never stored as a number. It is the sum of a user's rows in `essence_ledger`, an append-only table in the cosmetics DataSource. Every movement has a `kind` and a `reference_key`, and `(user_id, kind, reference_key)` is unique, so applying the same movement twice is a no-op instead of a double credit or debit.

| Kind | Reference key | Delta | Written by |
| --- | --- | --- | --- |
| `mission` | `<mission_code>:<period_key>` | the mission's reward amount | claim endpoint |
| `daily_bonus` | `<day key>` | 30, once all three daily missions of a day are claimed | claim endpoint |
| `achievement` | `user_achievements.id` | the achievement's `earned_points` × 2 | worker |
| `purchase` | `cosmetics.id` | minus the cosmetic's `essence_price` | shop endpoint |
| `adjustment` | free text | any | manual repairs |

`GET /me/essence` returns the balance. Domain code: `src/modules/rewards/domain/EssenceLedgerEntry.ts`.

## Periods

Missions are tracked per **period key**, computed in UTC so every player resets at the same moment:

- daily: the calendar day, `YYYY-MM-DD`;
- weekly: the ISO 8601 week, `YYYY-Www` (weeks start on Monday).

Only the current period can be claimed. A day that ends with completed but unclaimed missions pays nothing. Code: `src/modules/rewards/domain/MissionPeriod.ts`.

## Missions

The catalog is data: table `mission_catalog`, seeded by migration and editable with SQL. Each row has a `code`, bilingual `name`/`description` (`{ "en": ..., "es": ... }`, English mandatory and used as fallback), a `period`, a `rule` and a `reward`.

- `rule` is `{ "metric": ..., "target": n, "ranked"?: boolean }`. The metric names a behavior the engine knows how to measure, so the list is code, not data: `duelsPlayed`, `duelsWon`, `rankedDuelsPlayed`, `rankedWinStreak`, `winUnder10Turns`, `winDifferentFormat` (`src/modules/rewards/domain/Mission.ts`).
- `reward` is `{ "type": "essence", "amount": n }` or `{ "type": "cosmetic", "cosmeticId": "<uuid>" }`. Cosmetic rewards are granted as a `CAMPAIGN` entitlement.

**Daily draw.** Every active daily mission is in a pool; three are drawn per day by a hash of the day key and the mission code (`src/modules/rewards/domain/selectDailyMissions.ts`). Nothing is stored: every read of the same day agrees, and the draw cannot be predicted from the catalog alone. Weekly missions are not drawn: every active one applies.

**Wins against guests do not count.** Play metrics count any match. Win metrics count only when every opponent has a user id, so a player cannot farm wins against an anonymous second window.

`GET /me/missions?period=daily|weekly` returns the current period's missions with progress and claim state, localized from `Accept-Language` (`es` or `en`, default `en`). `POST /me/missions/:code/claim` pays once per period; the third daily claim of a day also pays the daily bonus.

### Adding a mission

1. Pick a metric from the list above. If the behavior you want is not there, add it to `MISSION_METRICS` and teach `evaluateMatch` how to measure it, with a test. Only then is it data.
2. Insert a row in `mission_catalog` (a migration under `src/migrations/` keeps environments aligned). Give it a unique `code`, both languages, a `period`, the `rule` and the `reward`.
3. A daily mission joins the pool immediately and may appear in the next day's draw. Changing the number of daily missions (`DAILY_MISSIONS_PER_DAY`) reshuffles the current day's draw, so deploy such a change right after the UTC midnight reset.
4. Set `active = false` to retire a mission; progress and claims already recorded stay.

## The worker

The game server writes match results straight to the shared Postgres (`matches`, `duels`, `user_achievements`); this API never ingests them. The rewards worker reads those tables as an outbox:

1. Every few seconds (`REWARDS_WORKER_INTERVAL_MS`) it opens one transaction and tries a transaction-scoped advisory lock. If another instance holds it, the tick is skipped, so the worker is safe to enable on several API instances.
2. For each **source** it reads its cursor row in `rewards_cursor`, then fetches the next batch of rows ordered by `(created_at, id)` after the cursor and older than `REWARDS_WORKER_LAG_MS`. The lag keeps a match whose duels are still being written from being read half-complete.
3. Each row becomes facts for one user and goes through the pure rules engine against that user's stored progress and state. Progress rows (`mission_progress`), per-user state (`user_reward_state`: last format, live ranked streak) and the cursor are written in the same transaction.
4. Commit. If the process dies first, nothing moved and the next tick repeats the batch.

Sources today: `matches` (ranked, one row per player per match) and `user_achievements` (each new row credits essence). Unranked matches are a planned third source once `unranked_matches` carries user ids.

The cursor is stored as UTC text with microseconds. Postgres timestamps keep microseconds and a JS `Date` keeps milliseconds; a cursor that went through a `Date` would re-read the last processed row every tick.

It runs inside the API process when `REWARDS_WORKER_ENABLED=true` (`src/index.ts`) or standalone with `bun run src/worker.ts`. Variables are listed in [operations.md](operations.md#rewards-worker).

### The rules engine contract

`evaluateMatch(facts, state, missions)` in `src/modules/rewards/domain/evaluateMatch.ts` is pure: no I/O, no clock, no randomness.

- `facts`: one match as seen from one user: `gameId, userId, won, ranked, opponentRegistered, banListName, date, duels[{ result, turns }]`.
- `state`: that user's current `progress` per applicable mission code, plus `lastFormat` and `rankedStreak`.
- returns the updated progress rows (with `completed`) and the new state.

Because it is pure, it is tested exhaustively without a database, and a backfill is the same code run over history.

### Backfill and repair

The worker is idempotent: progress upserts are keyed, ledger rows are unique, and the cursor only moves inside a committed transaction. To reprocess from a point in time, stop the worker, move or delete the cursor row and start it again:

```sql
-- Reprocess every match since a date (UTC)
UPDATE rewards_cursor SET last_created_at = '2026-10-01 00:00:00+00', last_id = NULL WHERE source = 'matches';
-- Or from the very beginning
DELETE FROM rewards_cursor WHERE source = 'matches';
```

Reprocessing recomputes `mission_progress` values from the stored state, so run it only from a point where that state is consistent (typically the beginning). Claims and essence already paid are never duplicated.

## The shop

`cosmetics.essence_price` (nullable) is the price in essence; `null` means not for sale. The initial migration prices every DONOR cosmetic at 800 and leaves the rest unpriced: STANDARD is free, REGISTERED is already granted to every signed-in user by tier, and EXCLUSIVE stays hand-granted unless a price is set. Prices are per cosmetic and change with an `UPDATE`.

`GET /shop` lists priced, active cosmetics and marks `owned` using the same gate that decides equipping (`EntitlementsGatekeeper`): a tier the user already holds counts as owned. `POST /shop/:cosmeticId/purchase` refuses what the user can already use (`409`), then, under a per-user lock in one transaction, checks the balance (`402 Insufficient essence`), debits the ledger and grants the cosmetic as a `PURCHASE` entitlement on the same connection, so debit and grant commit or roll back together.

## Tables (cosmetics DataSource)

| Table | Holds |
| --- | --- |
| `essence_ledger` | every essence movement |
| `mission_catalog` | the missions |
| `mission_progress` | value and `completed_at` per user, mission and period (written by the worker) |
| `mission_claims` | one row per claimed mission, user and period (written by the claim endpoint) |
| `user_reward_state` | last format played and live ranked streak per user |
| `rewards_cursor` | how far each source was drained |
| `cosmetics.essence_price` | shop price |
