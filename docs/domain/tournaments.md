# Tournaments

"Lightning tournaments" are brackets run by a separate **tournaments service**
(a different deployable, not part of this repository). This API is mostly a
thin proxy in front of it, plus a small amount of locally-stored ranking data.
`src/modules/tournaments/` is the only module split this way — see
`docs/architecture.md`'s module table.

## What lives upstream vs locally

| Owned upstream (tournaments service) | Stored locally (this API) |
| --- | --- |
| Tournament definitions, brackets, rounds, matches, participants, entries | `LightningRankingEntity` (`lightning_rankings` table): per-user, per-season `points`, `tournamentsWon`, `tournamentsPlayed` |
| Match results and their annulment | — |

Every upstream-owned read or write goes through a plain `fetch` to
`config.tournaments.apiUrl` (env var `TOURNAMENTS_API_URL`) — there is no
shared database between the two services for tournament data
(`TournamentGateway`, `src/modules/tournaments/infrastructure/TournamentGateway.ts`;
`TournamentController`, `src/modules/tournaments/infrastructure/TournamentController.ts`).
Every proxied call that can fail upstream documents a `500` with "Upstream
tournaments service unavailable" in Swagger, per the OpenAPI ratchet
(`docs/architecture.md`'s Swagger section, `UPSTREAM_DEPENDENT_OPERATIONS`).

## The API is a proxy

`TournamentController.routes` (`src/modules/tournaments/infrastructure/TournamentController.ts`)
owns its own routes under `/tournaments` and reads the bearer token itself
(see `docs/architecture.md`'s composition-root note on why this router is
different from the others). Most of its handlers do nothing but `fetch` the
upstream service and return its JSON verbatim, sometimes after an inline
admin-role check:

| Route | Upstream call | Admin only |
| --- | --- | --- |
| `GET /tournaments/` | `GET {apiUrl}/tournaments` | No |
| `POST /tournaments/` | `POST {apiUrl}/tournaments`, injecting this API's own webhook URL as `webhookUrl` (`CreateTournamentProxyUseCase`) | Yes |
| `POST /tournaments/:id/enroll` | `POST {apiUrl}/tournaments/:id/entries`; on a user's first-ever enrollment, first creates their upstream player/participant and stores `participantId` locally (`TournamentEnrollmentUseCase`) | No (any authenticated user, for themselves) |
| `POST /tournaments/:id/withdraw` | `DELETE {apiUrl}/tournaments/:id/entries/:participantId` | No |
| `GET /tournaments/:id/bracket` | `GET {apiUrl}/tournaments/:id/bracket` | No |
| `POST /tournaments/:id/bracket` | `POST {apiUrl}/tournaments/:id/bracket/generate-full` | Yes |
| `POST /tournaments/:id/matches/:matchId/result` | `POST {apiUrl}/.../matches/:matchId/result` | Yes |
| `DELETE /tournaments/:id/matches/:matchId/result` | `DELETE {apiUrl}/.../matches/:matchId/result` | Yes |
| `GET /tournaments/:id/entries` | `GET {apiUrl}/tournaments/:id/entries` | No |
| `GET /tournaments/ranking` | Local `player`-of-lightning ranking (see below) | No |

Admin checks here decode the bearer token inline and compare
`role !== UserProfileRole.ADMIN`, the same inline pattern
`docs/architecture.md` describes for `user-router.ts`'s ban routes — not
`JwtAdminAuthorizer`.

## The webhook

`POST /tournaments/webhook` is called by the tournaments service when a
tournament completes. It is **not authenticated**: Swagger documents this
explicitly ("accepts no shared secret or signature, so anything reaching this
URL can trigger a ranking update",
`TournamentController.ts:105-106`). Its handler ignores the request body's
`winnerId`/`completedAt` and only uses `tournamentId`, delegating to
`UpdateRankingUseCase.execute`.

## Local ranking

`UpdateRankingUseCase.execute({ tournamentId })`
(`src/modules/tournaments/application/UpdateRankingUseCase.ts`):

1. Fetches every match of the tournament from the upstream service.
2. Derives final positions from the single-elimination bracket structure
   (winner of the final round is 1st, its loser 2nd, semifinal losers tied
   3rd, and so on by round — `calculateRankings`, same file, lines 106-141).
3. Awards fixed points by position (`POINTS_BY_POSITION`, lines 8-17: 10/7/5/3
   for 1st–4th, 2 for 5th–8th, 1 for anything else/unmapped).
4. For each ranked participant, resolves the local user by
   `findByParticipantId`, then upserts their `LightningRankingEntity` row for
   `config.season` — creating it on first tournament, or adding points and
   incrementing `tournamentsPlayed`/`tournamentsWon` otherwise.

A participant the API cannot map to a local user (e.g. an upstream-only
guest) is skipped with a logged error, not a thrown one — the rest of the
batch still updates
(`UpdateRankingUseCase.ts:62-68`). `GET /tournaments/ranking?limit=` reads
this table directly (`GetRankingUseCase.execute`,
`src/modules/tournaments/application/GetRankingUseCase.ts`), independent of
the ranked-ladder tiers in [seasons-ranks-points.md](seasons-ranks-points.md)
— lightning points are their own leaderboard, unrelated to `player_stats` or
`player_ratings`.
