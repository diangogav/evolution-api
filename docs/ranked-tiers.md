# Ranked tiers: client integration guide

Every ranked player has a tier per format ladder and per season, and the API returns it wherever it already returns ratings. The ladder has seven levels with Master Duel names: Rookie, Bronze, Silver, Gold, Platinum, Diamond and Master.

Tiers are computed live from the player's game history at request time. Nothing is stored, so a tier is always current and an annulled match disappears from it on the next request. The client never computes anything: the API returns the tier, the progress toward the next one and a catalog with every threshold, requirement and icon name.

Base URL: `https://api.evolutionygo.com/api/v1`. The three endpoints below are public and need no token. The live Swagger UI at `/swagger` documents the same routes.

## 1. Endpoints

| Call | What it returns | Typical use |
| --- | --- | --- |
| `GET /users/{userId}/stats?season={n}` | The player's profile; each entry of `ratings[]` carries `tier` | Profile screen, badge next to the name |
| `GET /stats?banListName={ladder}&season={n}&page={p}&limit={<=100}` | One leaderboard page; each row carries `tier` | Ranking screen with badges |
| `GET /ranked-tiers?banListName={ladder}` | The tier catalog: names, thresholds, requirements, icon names | Load once per session to render copy and icons |

`season` defaults to the current season when omitted. On the leaderboard, `banListName` defaults to `Global`, which has no tiers, so always pass the ladder you display.

### Profile response

Real response, trimmed to two ratings. Every field that existed before the tiers is unchanged; only `tier` was added to each rating entry.

```json
{
  "userId": "524f64bd-48dc-44e5-be43-341dbfda6cb1",
  "username": "Chazz_666",
  "points": 19, "wins": 38, "losses": 24, "winRate": 61.29032258064516, "position": "20",
  "achievements": [],
  "ratings": [
    {
      "banListName": "2010.03 Edison", "rankType": "banlist",
      "rating": 1072, "peak": 1118, "gamesPlayed": 61, "provisional": false,
      "tier": {
        "id": "gold", "name": "Gold",
        "effectivePoints": 20, "gamesPlayed": 61,
        "progress": {
          "nextTierId": "platinum", "unit": "points", "current": 20, "target": 25,
          "distinctOpponentWins": { "current": 14, "required": 5 }
        }
      }
    },
    {
      "banListName": "JTP", "rankType": "banlist",
      "rating": 1020, "peak": 1020, "gamesPlayed": 1, "provisional": true,
      "tier": {
        "id": "rookie", "name": "Rookie",
        "effectivePoints": 2, "gamesPlayed": 1,
        "progress": { "nextTierId": "bronze", "unit": "games", "current": 1, "target": 5, "distinctOpponentWins": null }
      }
    }
  ]
}
```

### Leaderboard row

One Master row from the TCG ladder. Master is the only tier that carries `rating` and `peak` inside `tier`. Row order is still by season points; tiers never change the ranking.

```json
{
  "username": "Fuku", "points": 90, "wins": 84, "losses": 27, "rating": 1212,
  "tier": {
    "id": "master", "name": "Master",
    "effectivePoints": 88, "gamesPlayed": 111,
    "progress": null,
    "rating": 1212, "peak": 1256
  }
}
```

### Catalog response

```json
{
  "banListName": "Edison",
  "dailyOpponentCap": 2,
  "dayBoundary": "UTC",
  "tiers": [
    { "id": "rookie",   "name": "Rookie",   "order": 0, "kind": "placement", "icon": "tier-rookie",   "threshold": null, "minGames": 5,    "distinctOpponentWins": null, "requiresTier": null,       "size": null },
    { "id": "bronze",   "name": "Bronze",   "order": 1, "kind": "absolute",  "icon": "tier-bronze",   "threshold": null, "minGames": null, "distinctOpponentWins": null, "requiresTier": null,       "size": null },
    { "id": "silver",   "name": "Silver",   "order": 2, "kind": "absolute",  "icon": "tier-silver",   "threshold": 3,    "minGames": null, "distinctOpponentWins": null, "requiresTier": null,       "size": null },
    { "id": "gold",     "name": "Gold",     "order": 3, "kind": "absolute",  "icon": "tier-gold",     "threshold": 10,   "minGames": null, "distinctOpponentWins": null, "requiresTier": null,       "size": null },
    { "id": "platinum", "name": "Platinum", "order": 4, "kind": "absolute",  "icon": "tier-platinum", "threshold": 25,   "minGames": null, "distinctOpponentWins": 5,    "requiresTier": null,       "size": null },
    { "id": "diamond",  "name": "Diamond",  "order": 5, "kind": "absolute",  "icon": "tier-diamond",  "threshold": 40,   "minGames": null, "distinctOpponentWins": 5,    "requiresTier": null,       "size": null },
    { "id": "master",   "name": "Master",   "order": 6, "kind": "relative",  "icon": "tier-master",   "threshold": null, "minGames": 20,   "distinctOpponentWins": null, "requiresTier": "platinum", "size": 5 }
  ]
}
```

## 2. The `tier` object

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `"rookie" \| "bronze" \| "silver" \| "gold" \| "platinum" \| "diamond" \| "master"` | Stable identifier. Use it for icons and logic, never `name`. |
| `name` | string | Display name in English. Localize on the client if needed. |
| `effectivePoints` | integer | The points the ladder rules count for this player (see section 3). Can be negative for Bronze players and can be higher than the leaderboard `points`. |
| `gamesPlayed` | integer | Non-annulled games in this ladder and season. |
| `progress` | object or `null` | Progress toward the next tier. `null` for Diamond and Master, which have no bar. |
| `rating`, `peak` | integer, only present when `id` is `"master"` | The Master player's Elo and season peak. Absent for every other tier. |

`tier` itself is `null` on a rating entry when the ladder has no tiers (`Global`, or a ladder the API does not recognize).

### The `progress` object

| Field | Type | Meaning |
| --- | --- | --- |
| `nextTierId` | tier id | The tier the bar leads to. |
| `unit` | `"games"` or `"points"` | `games` for Rookie (the bar counts games toward 5); `points` for Bronze to Platinum (the bar counts effective points toward the next threshold). |
| `current` | integer | Games played, or effective points. May be negative when `unit` is `points` and the player is Bronze. |
| `target` | integer | 5 for Rookie; the next tier's threshold otherwise. |
| `distinctOpponentWins` | object or `null` | Present only when `nextTierId` is `platinum` or `diamond`: `{ "current": n, "required": 5 }`, the number of different opponents the player has beaten. The next tier also needs this to be met. |

Bar fill: `clamp((current - floor) / (target - floor), 0, 1)` where `floor` is the current tier's own threshold from the catalog (0 for Rookie and Bronze). Showing `current / target` as text is enough for most screens.

## 3. Ladder rules, for requirement copy

The client never applies these rules; they explain what the numbers mean so the UI can describe them.

| Tier | How it is granted |
| --- | --- |
| Rookie | Fewer than 5 games in the ladder this season. |
| Bronze | 5 or more games, fewer than 3 effective points. |
| Silver | 3 effective points. |
| Gold | 10 effective points. |
| Platinum | 25 effective points and wins over at least 5 different opponents. |
| Diamond | 40 effective points and wins over at least 5 different opponents. |
| Master | The top 5 players of the ladder among those with 20 or more games who reached Platinum. Ordered by season points, then win rate. Empty when fewer than 5 qualify. |

Effective points differ from the leaderboard points in three ways:

- **Daily cap.** Only the first 2 games per UTC calendar day against the same opponent count. Games beyond that still count as played and still count toward "different opponents beaten", but add no points.
- **Floors.** Once a tier is granted, its threshold becomes a floor for the rest of the season: losses cannot push effective points below it. A Gold player who reached 12 and then lost five games keeps 10 and stays Gold.
- **No floor before the first tier.** Until Silver is reached, effective points move freely and can be negative.

Annulled matches are excluded entirely (points, game count and opponents); if a match is reinstated it counts again at its original date.

Suggested copy for the requirement line under a bar: "Platinum: 25 points and wins over 5 different duelists." Use the catalog's `threshold` and `distinctOpponentWins` fields so the numbers never go stale.

## 4. Rendering guidance

- **Badge everywhere, format-specific.** Inside a lobby or a duel, show the tier of the format being played. Outside, the agreed base badge is the player's `TCG` ladder tier (the `TCG` entry in `ratings[]`), not Global.
- **Icons.** The catalog gives an icon key per tier (`tier-rookie` to `tier-master`). Ship one asset per key in the client for now; a shared asset set is planned.
- **Null handling.** `tier` is `null` for Global and unknown ladders: hide the badge. `progress` is `null` for Diamond and Master: hide the bar, keep the badge. `distinctOpponentWins` is `null` below Platinum.
- **Master.** Show the Elo (`rating`, optionally `peak`) only for Master players; other tiers do not expose it inside `tier`. A ladder may have no Masters at all (small formats): nothing special to render, the top players simply show Diamond or Platinum.
- **Negative points.** A Bronze player can show `current: -4`. Render the bar empty and the number as is.
- **Order.** Keep the leaderboard order the API returns; it is by season points and is independent of tiers.

## 5. Catalog usage

- Fetch `GET /ranked-tiers` once per app session and cache it in memory; it only changes with an API deploy.
- `kind` tells the client how a tier is earned: `placement` (Rookie, by games played), `absolute` (Bronze to Diamond, by threshold), `relative` (Master, by ranking). Render `relative` tiers without a target.
- Pass `?banListName=` when a screen is bound to one ladder so per-format overrides apply if the ladder ever defines any; today every ladder returns the same seven entries.
- `dailyOpponentCap` and `dayBoundary` describe the cap in effect; use them in help text instead of hardcoding "2 per day".
- Do not hardcode thresholds, names or icon keys: the numbers were calibrated on live data and may be tuned.

## 6. Freshness and performance

- Tiers are computed on every request. There is no cache on the API side, so an annulled or reinstated match is reflected immediately.
- Cost measured on the current dataset: the profile adds two queries (about 6 ms server-side); leaderboard page 1 of a long season adds roughly 200 to 320 ms server-side because it replays up to 100 players plus the Master candidates.
- Cache leaderboard pages on the client for a short time (30 to 60 seconds) if the screen refreshes often; do not poll the profile for tier changes, they only move when the player finishes a game.

## 7. Edge cases

| Situation | What the API returns |
| --- | --- |
| Player with fewer than 5 games | `rookie`, `progress.unit = "games"`. |
| Player reached Platinum, ranked 6th | `platinum` or `diamond` from their own points; only the top 5 are `master`. |
| Fewer than 5 players qualify for Master | Nobody is `master`; the best players show their absolute tier. |
| Two players tied at the Master boundary | Broken deterministically by win rate, then user id; never more than 5 Masters. |
| Match annulled after a promotion | The tier is recomputed without that match on the next read; the player can drop. |
| New season | Every ladder starts empty: everyone is Rookie until 5 games. |
| `?banListName=` sent empty | Default ladder is returned and `banListName` echoes `""`; omit the parameter instead. |

## 8. Reference

- **Ladder names** are the `banListName` values the leaderboard already accepts: dated ban lists such as `2026.09 TCG`, `2026.07 OCG`, `2010.03 Edison`, and format ladders such as `TCG`, `OCG`, `Edison`, `GOAT`, `MD`, `Rush`, `Traditional`, `Worlds`. `GET /ban-lists/grouped` lists the current ones with their format. `rankType` on each rating entry says whether it is a `banlist`, a `group` or `global`.
- **Compatibility.** The `tier` field is additive; no existing field or ordering changed. New fields may be added inside `tier` in future versions; unknown fields should be ignored. The catalog endpoint carries a runtime response schema, so its shape is validated on every response.
- **Season.** The season number is the same one the leaderboard uses. Tiers reset with it because they are computed from that season's games only.
