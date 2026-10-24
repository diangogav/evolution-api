---
name: evolution-server
description: Use the EDOpro-server-ts game server repository as a reference when you need to know how match results, stats, or game logic are produced before they reach this API.
---

# EDOpro Server Reference

The game server (`EDOpro-server-ts`) writes match results and stats into the shared
schema (`src/evolution-types/`) that this API reads. Check it when an API behavior
depends on how the server produces that data.

## Location

The repository is a sibling checkout: `../EDOpro-server-ts` relative to this repo's
root. If it is not there, ask the user for its path; do not guess.

## Key files

| Topic | Path in EDOpro-server-ts |
| --- | --- |
| End-of-duel dispatch (what happens when a match finishes) | `src/edopro/room/application/FinishDuelHandler.ts` |
| Basic stats calculation | `src/plugins/basic-stats/application/BasicStatsCalculator.ts` (tests next to it) |

If a path is missing, search the repository by file name before reporting it.

## When to use

- Checking how a stat, rating, or match field is computed before changing code that reads it.
- Confirming which side owns a table or column in the shared schema.
