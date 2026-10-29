# Community decks

Legal decks from YGOPRODeck, synced daily by this API and served to the client's
"Community" tab. Only this API talks to YGOPRODeck; the client reads
`/api/v1/community-decks`.

## Sources

| Input | Where | Notes |
| --- | --- | --- |
| Decks | `https://ygoprodeck.com/api/decks/getDecks.php?format=<category>&limit=20&offset=<n>` | `YgoProDeckClient`. At most one request per second, User-Agent `EvolutionYGO/1.0 (+https://evoduel.com)`, `COMMUNITY_DECKS_MAX_PAGES` pages per category. |
| TCG list | newest `!… TCG` section of `https://cdntx.moecube.com/ygopro-database/zh-CN/lflist.conf` | The base list the client loads. A blacklist. |
| Genesys list | `evolution-assets/main/lflist/genesys.lflist.conf`, section `Genesys` | A blacklist; its third column (point cost) is ignored, so point budgets are not checked. |
| Edison list | `evolution-assets/main/lflist/edison.lflist.conf`, section `2010.3 Edison` | A whitelist that lists our pre-errata ids instead of the real passcodes. |
| Alternates | `evolution-assets/main/cdb/alternates.json` | `{ version: 1, alternates: { "<original>": ["<alt>"] } }`, built from every cdb's `alias`. |

| YGOPRODeck category | Validated against |
| --- | --- |
| `Tournament Meta Decks` | TCG list |
| `Tournament Meta Decks (Genesys)` | Genesys list |
| `Edison Format Decks` | Edison list |

## Curation (`src/modules/community-decks/domain`)

1. **Quality** (`meetsQuality`): tournament categories pass; an Edison upload needs
   `COMMUNITY_DECKS_EDISON_MIN_VIEWS` views.
2. **Normalize** (`normalizeDeck`): a card the list does not allow is swapped for an
   alternate the list explicitly allows (Armory Arm 29071332 → 910003009). An alternate a
   blacklist merely does not mention never qualifies, so a banned card cannot come back
   under another id.
3. **Validate** (`validateDeck`): main 40–60, extra ≤ 15, side ≤ 15, every card allowed,
   copies counted across main, extra and side with each alternate grouped with its
   original. An unlisted alternate inherits its original's blacklist limit.
4. **Dedupe** (`deckContentHash`): same format and same sorted lists are one deck; the
   most viewed upload is kept.

Illegal decks are never stored. Not checked: whether a passcode exists at all under a
blacklist (no cdb is read), Genesys point budgets, and alternate artworks under the Edison
whitelist (only original → alternate swaps are made).

## Sync (`SyncCommunityDecks`)

- One instance at a time (`PostgresSyncLock`, a session advisory lock on one connection).
- Skipped while the newest `synced_at` is younger than `COMMUNITY_DECKS_WORKER_INTERVAL_MS`.
- No alternates map → the whole sync is skipped and nothing changes.
- Each category is all or nothing: its list and every page must load, and an empty
  answer counts as a failure. A failed category is logged and keeps its rows; a
  successful one is upserted by `(source, source_id)` and its unseen rows are deleted, in
  one transaction.
- YGOPRODeck only shows relative dates ("2 weeks ago"); a row keeps the first date read for
  its current list and takes a new one only when the list changes.

## API

`GET /api/v1/community-decks?format=&q=&page=&pageSize=` → `{ items, page, pageSize, total }`,
most viewed first, `pageSize` 1–48 (default 24), `q` matches name or author
case-insensitively. `GET /api/v1/community-decks/formats` → `[{ format, count }]`. Both
public. Each item links back to its YGOPRODeck page (`sourceUrl`) and names its author.
