import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { HttpCardAlternatesSource } from "../../modules/community-decks/infrastructure/HttpCardAlternatesSource";
import { HttpFormatListSource } from "../../modules/community-decks/infrastructure/HttpFormatListSource";
import { getJson, getText } from "../../modules/community-decks/infrastructure/httpGet";
import { CancelLightningTournament } from "../../modules/lightning/application/CancelLightningTournament";
import { CreateLightningTournament } from "../../modules/lightning/application/CreateLightningTournament";
import { EnterLightningTournament } from "../../modules/lightning/application/EnterLightningTournament";
import { GetLightningRankings } from "../../modules/lightning/application/GetLightningRankings";
import { GetLightningTournament } from "../../modules/lightning/application/GetLightningTournament";
import { GetMyActiveLightningEntries } from "../../modules/lightning/application/GetMyActiveLightningEntries";
import { GetMyLightningState } from "../../modules/lightning/application/GetMyLightningState";
import { ListLightningTournaments } from "../../modules/lightning/application/ListLightningTournaments";
import { PauseLightningEntry } from "../../modules/lightning/application/PauseLightningEntry";
import { ResumeLightningEntry } from "../../modules/lightning/application/ResumeLightningEntry";
import { WithdrawLightningEntry } from "../../modules/lightning/application/WithdrawLightningEntry";
import { CommunityDeckLegalityChecker } from "../../modules/lightning/infrastructure/CommunityDeckLegalityChecker";
import { LightningByePostgresRepository } from "../../modules/lightning/infrastructure/LightningByePostgresRepository";
import { LightningEntryPostgresRepository } from "../../modules/lightning/infrastructure/LightningEntryPostgresRepository";
import { LightningGamePostgresRepository } from "../../modules/lightning/infrastructure/LightningGamePostgresRepository";
import { LightningResultPostgresRepository } from "../../modules/lightning/infrastructure/LightningResultPostgresRepository";
import {
	ActiveLightningEntryListSchema,
	CancelLightningTournamentBodySchema,
	CreateLightningTournamentBodySchema,
	EnterLightningBodySchema,
	LightningEntrySchema,
	LightningRankingListSchema,
	LightningTournamentDetailSchema,
	LightningTournamentListSchema,
	LightningTournamentSchema,
	LightningTournamentStatusSchema,
	MyLightningStateSchema,
} from "../../modules/lightning/infrastructure/LightningSchemas";
import { LightningTournamentPostgresRepository } from "../../modules/lightning/infrastructure/LightningTournamentPostgresRepository";
import { PlayerDirectoryPostgresRepository } from "../../modules/lightning/infrastructure/PlayerDirectoryPostgresRepository";
import { BunRedisReservationStore } from "../../modules/reserved-duel/infrastructure/BunRedisReservationStore";
import { ReservedDuelPostgresReader } from "../../modules/reserved-duel/infrastructure/ReservedDuelPostgresReader";
import { CosmeticsTransactionRunner } from "../../modules/rewards/infrastructure/CosmeticsTransactionRunner";
import { Pino } from "../../shared/logger/infrastructure/Pino";
import { redisClient } from "../../shared/redis/redisClient";
import { type AdminAuthorizer, adminAuthorizer } from "../auth/AdminAuthorizer";
import { requireUser as defaultRequireUser } from "../auth/requireUser";
import { buildApplyLightningGame } from "../composition/buildLightning";
import { ErrorSchema, errorResponses, jsonOk } from "../openapi/responses";

type Runner<T> = Pick<T, Extract<keyof T, "run">>;

export interface LightningRouterDependencies {
	readonly authorizer: AdminAuthorizer;
	readonly requireUser: typeof defaultRequireUser;
	readonly clock: () => Date;
	readonly defaultSeason: number;
	readonly list: Runner<ListLightningTournaments>;
	readonly get: Runner<GetLightningTournament>;
	readonly rankings: Runner<GetLightningRankings>;
	readonly enter: Runner<EnterLightningTournament>;
	readonly withdraw: Runner<WithdrawLightningEntry>;
	readonly pause: Runner<PauseLightningEntry>;
	readonly resume: Runner<ResumeLightningEntry>;
	readonly myState: Runner<GetMyLightningState>;
	readonly myActive: Runner<GetMyActiveLightningEntries>;
	readonly create: Runner<CreateLightningTournament>;
	readonly cancel: Runner<CancelLightningTournament>;
}

const ID = "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";

const tournamentExample = {
	id: ID,
	name: "Friday Lightning",
	format: "edison" as const,
	status: "running" as const,
	season: 7,
	registrationOpensAt: "2026-11-13T19:00:00.000Z",
	startsAt: "2026-11-13T20:00:00.000Z",
	endsAt: "2026-11-13T21:00:00.000Z",
	turnTimeSeconds: 90,
	lobbyTimeoutSeconds: 90,
	minPlayers: 4,
	maxPlayers: 64,
	pointsByPosition: { positions: [10, 7, 5, 3], others: 1 },
	essenceByPosition: { positions: [300, 200, 100], others: 25 },
	cancelledReason: null,
	createdAt: "2026-11-09T12:00:00.000Z",
	system: "arena" as const,
	rounds: null,
	currentRound: 0,
	roundEndsAt: null,
	nextRoundAt: null,
};

const swissExample = {
	...tournamentExample,
	name: "Friday Swiss",
	endsAt: "2026-11-13T22:44:00.000Z",
	system: "swiss" as const,
	rounds: 4,
	currentRound: 2,
	roundEndsAt: "2026-11-13T21:21:00.000Z",
};

const entryExample = {
	userId: "6f1c2a9e-0d4b-4c1e-9a57-3b2d8e7f6a10",
	status: "active" as const,
	presence: "idle" as const,
	score: 3,
	wins: 1,
	draws: 0,
	losses: 1,
	gamesPlayed: 2,
	noShows: 0,
	registeredAt: "2026-11-13T19:12:00.000Z",
};

const opponent = { userId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", username: "Chazz_666" };

const unprocessable = (description: string) => ({
	422: { description, content: { "text/plain": { schema: ErrorSchema } } },
});
const conflict = (description: string) => ({
	409: { description, content: { "text/plain": { schema: ErrorSchema } } },
});

export function createLightningRouter(deps: LightningRouterDependencies) {
	const playerInput = (userId: string, id: string) => ({
		tournamentId: id,
		userId,
		now: deps.clock(),
	});

	return new Elysia({ prefix: "/lightning" })
		.use(bearer())
		.get("/", ({ query }) => deps.list.run(query.status ? { status: query.status } : {}), {
			query: t.Object({
				status: t.Optional(LightningTournamentStatusSchema),
			}),
			detail: {
				tags: ["Lightning"],
				summary: "List lightning tournaments",
				description:
					"Without a status: every tournament not over yet (scheduled, registration, running, finishing), soonest start first, with its active entry count. With `completed` or `cancelled`: the 50 most recent. Public: no credentials required.",
				responses: {
					200: jsonOk(LightningTournamentListSchema, "Tournaments", [
						{ ...tournamentExample, players: 12 },
					]),
					...errorResponses(422),
				},
			},
		})
		.get(
			"/rankings",
			({ query }) =>
				deps.rankings.run({ season: query.season ?? deps.defaultSeason, limit: query.limit }),
			{
				query: t.Object({
					season: t.Optional(
						t.Integer({ minimum: 1, description: "Defaults to the current season" }),
					),
					limit: t.Integer({ minimum: 1, maximum: 100, default: 50 }),
				}),
				detail: {
					tags: ["Lightning"],
					summary: "Lightning season ranking",
					description:
						"Season points earned in lightning tournaments, most points first, with tournaments won and played. Public: no credentials required.",
					responses: {
						200: jsonOk(LightningRankingListSchema, "Season ranking", [
							{
								position: 1,
								userId: opponent.userId,
								username: opponent.username,
								points: 27,
								tournamentsWon: 2,
								tournamentsPlayed: 4,
							},
						]),
						...errorResponses(422),
					},
				},
			},
		)
		.get("/:id", ({ params }) => deps.get.run({ tournamentId: params.id, now: deps.clock() }), {
			params: t.Object({ id: t.String() }),
			detail: {
				tags: ["Lightning"],
				summary: "Get a lightning tournament",
				description:
					"The tournament with its standings (live until completed, then the final results with the season points and essence each position earned) and the rooms of the games being played, which spectators join with `w,<roomId>`. Arena standings order by score, wins, Buchholz, registration; Swiss by score, Buchholz, wins, registration. A Swiss tournament also returns `round`: the current (or last closed) round's tables with their results as they arrive, the room to watch while a table plays, and the bye. Public: no credentials required.",
				responses: {
					200: jsonOk(LightningTournamentDetailSchema, "The tournament", {
						...swissExample,
						players: 12,
						standings: [
							{
								position: 1,
								userId: opponent.userId,
								username: opponent.username,
								status: "active",
								score: 6,
								wins: 2,
								draws: 0,
								losses: 0,
								gamesPlayed: 2,
								tiebreak: 3,
								pointsAwarded: null,
								essenceAwarded: null,
							},
						],
						watchable: [
							{
								reservationId: "Xy3kP9aQ2mNb7RtL",
								roomId: 4213,
								startedAt: "2026-11-13T20:31:00.000Z",
								players: [opponent, { userId: entryExample.userId, username: "Jaden" }],
							},
						],
						round: {
							number: 2,
							tables: [
								{
									reservationId: "Xy3kP9aQ2mNb7RtL",
									seat0: opponent,
									seat1: { userId: entryExample.userId, username: "Jaden" },
									resolution: null,
									roomId: 4213,
								},
								{
									reservationId: "Qw8nR2tY5uIo1PaS",
									seat0: { userId: "3c2a1f0e-7b6d-4e5f-8a9b-0c1d2e3f4a5b", username: "Syrus" },
									seat1: { userId: "9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b", username: "Bastion" },
									resolution: "no_show",
									noShowSeats: [1],
									roomId: null,
								},
							],
							bye: { userId: "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a", username: "Alexis" },
						},
					}),
					...errorResponses(404),
				},
			},
		})
		.post(
			"/",
			({ bearer: token, body }) => {
				const admin = deps.authorizer.requireAdmin(token);
				return deps.create.run({
					name: body.name,
					format: body.format,
					season: body.season ?? deps.defaultSeason,
					registrationOpensAt: new Date(body.registrationOpensAt),
					startsAt: new Date(body.startsAt),
					endsAt: new Date(body.endsAt),
					system: body.system,
					rounds: body.rounds,
					roundMinutes: body.roundMinutes,
					roundBreakSeconds: body.roundBreakSeconds,
					turnTimeSeconds: body.turnTimeSeconds,
					lobbyTimeoutSeconds: body.lobbyTimeoutSeconds,
					minPlayers: body.minPlayers,
					maxPlayers: body.maxPlayers,
					pointsByPosition: body.pointsByPosition,
					essenceByPosition: body.essenceByPosition,
					createdBy: admin.userId,
					now: deps.clock(),
				});
			},
			{
				body: CreateLightningTournamentBodySchema,
				detail: {
					tags: ["Lightning Admin"],
					summary: "Create a lightning tournament",
					description:
						"Schedules a tournament. Defaults: arena system, 90 s per turn, 90 s to join each room, 4 to 64 players, season points 10/7/5/3 then 1 for every other player with a game, no essence. The defaults are stored on the tournament, so changing them later never rewrites it. Registration opens at once when its time already passed. `system: swiss` plays fixed rounds (`rounds` 2-9, or null for max(3, ceil(log2(players))) fixed at the start), each with a deadline of `roundMinutes` (default 40) and a break of `roundBreakSeconds` (default 60); its `endsAt` is ignored and estimated as startsAt + rounds × (roundMinutes + break), from maxPlayers until the start.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(LightningTournamentSchema, "The scheduled tournament", {
							...tournamentExample,
							status: "scheduled",
						}),
						...errorResponses(401, 403),
						...unprocessable(
							"Invalid body, a window out of order or in the past, bad bounds, or Swiss settings out of range",
						),
					},
				},
			},
		)
		.post(
			"/:id/cancel",
			({ bearer: token, params, body }) => {
				deps.authorizer.requireAdmin(token);
				return deps.cancel.run({ tournamentId: params.id, reason: body.reason, now: deps.clock() });
			},
			{
				params: t.Object({ id: t.String() }),
				body: CancelLightningTournamentBodySchema,
				detail: {
					tags: ["Lightning Admin"],
					summary: "Cancel a lightning tournament",
					description:
						"Cancels a tournament that has not completed: live games are voided and their reservations revoked, and nothing is awarded.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(LightningTournamentSchema, "The cancelled tournament", {
							...tournamentExample,
							status: "cancelled",
							cancelledReason: "Server maintenance",
						}),
						...errorResponses(401, 403, 404, 422),
						...conflict("The tournament already completed or was cancelled"),
					},
				},
			},
		)
		.guard({}, (app) =>
			app
				.use(deps.requireUser)
				// Static segments win over `/:id` in Elysia's router, whatever the registration order.
				.get("/me/active", ({ userId }) => deps.myActive.run({ userId }), {
					detail: {
						tags: ["Lightning"],
						summary: "List my active lightning entries",
						description:
							"What the client polls from any page to tell the player they were called to a duel: one item per active entry in a tournament in registration, running or finishing, soonest start first. `state` is the entry's presence (never `away` in Swiss); `game` is the pending pairing (room password, seat, room once open, opponent) or null; `bye` is true when the player has the bye in the current Swiss round. Read-only: unlike `GET /lightning/{id}/me` it applies no finished game, so a result shows once the worker or the tournament page applies it.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(ActiveLightningEntryListSchema, "The player's active entries", [
								{
									tournamentId: ID,
									name: swissExample.name,
									system: "swiss",
									status: "running",
									startsAt: swissExample.startsAt,
									state: "paired",
									game: {
										reservationId: "Xy3kP9aQ2mNb7RtL",
										password: "rv#Xy3kP9aQ2mNb7RtL",
										seat: 1,
										roomId: 4213,
										opponent,
									},
									bye: false,
								},
							]),
							...errorResponses(401, 403),
						},
					},
				})
				.post(
					"/:id/entries",
					({ userId, params, body }) =>
						deps.enter.run({ ...playerInput(userId, params.id), deck: body.deck }),
					{
						params: t.Object({ id: t.String() }),
						body: EnterLightningBodySchema,
						detail: {
							tags: ["Lightning"],
							summary: "Enter a lightning tournament",
							description:
								"Registers the player with a deck, checked against the format's list (sizes, copies, legality). The server requires exactly these lists at every duel of the tournament. Accepted during registration and, for an arena, late while the tournament runs; Swiss entries close at the start. A player who withdrew may enter again with a new deck and keeps their score.",
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(LightningEntrySchema, "The entry", {
									...entryExample,
									score: 0,
									wins: 0,
									losses: 0,
									gamesPlayed: 0,
								}),
								...errorResponses(401, 403, 404),
								...conflict("Already entered"),
								...unprocessable(
									"Illegal deck (with the reason), tournament full, or registration closed",
								),
							},
						},
					},
				)
				.delete(
					"/:id/entries/me",
					({ userId, params }) => deps.withdraw.run(playerInput(userId, params.id)),
					{
						params: t.Object({ id: t.String() }),
						detail: {
							tags: ["Lightning"],
							summary: "Withdraw from a lightning tournament",
							description:
								"Leaves the tournament: the player is never paired again (in Swiss, this is the drop). A game already paired or live runs its course and counts for both players.",
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(LightningEntrySchema, "The withdrawn entry", {
									...entryExample,
									status: "withdrawn",
									presence: "away",
								}),
								...errorResponses(401, 403, 404),
								...unprocessable("The tournament is over, or the entry was removed"),
							},
						},
					},
				)
				.post(
					"/:id/entries/me/pause",
					({ userId, params }) => deps.pause.run(playerInput(userId, params.id)),
					{
						params: t.Object({ id: t.String() }),
						detail: {
							tags: ["Lightning"],
							summary: "Pause my lightning entry",
							description:
								"Marks the player away so pairing skips them; the client sends it when the player leaves the tournament page. Idempotent. Swiss has no pause: it answers 422 (withdraw to drop).",
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(LightningEntrySchema, "The paused entry", {
									...entryExample,
									presence: "away",
								}),
								...errorResponses(401, 403, 404),
								...conflict("A game of the player is paired or live"),
								...unprocessable(
									"The tournament is over, the entry is not active, or the tournament is Swiss",
								),
							},
						},
					},
				)
				.post(
					"/:id/entries/me/resume",
					({ userId, params }) => deps.resume.run(playerInput(userId, params.id)),
					{
						params: t.Object({ id: t.String() }),
						detail: {
							tags: ["Lightning"],
							summary: "Resume my lightning entry",
							description:
								'"I\'m back": an away player (paused, or parked after missing a room) waits for a pairing again, from now. Idempotent.',
							security: [{ bearerAuth: [] }],
							responses: {
								200: jsonOk(LightningEntrySchema, "The waiting entry", entryExample),
								...errorResponses(401, 403, 404),
								...unprocessable("The tournament is over, or the entry is not active"),
							},
						},
					},
				)
				.get("/:id/me", ({ userId, params }) => deps.myState.run(playerInput(userId, params.id)), {
					params: t.Object({ id: t.String() }),
					detail: {
						tags: ["Lightning"],
						summary: "Get my lightning state",
						description:
							"What the waiting room polls (every 3 s while open). The player's finished game is applied first, so its result shows right away. `state` is the entry's presence: `paired` comes with `game` (room password, seat, opponent), `playing` once the duel started, `idle` while waiting, `away` after a pause or a missed room (never in Swiss). `lastGame` is the latest result while nothing is pending. `bye` is true when the player has the bye in the current Swiss round. `entry` is null when the player did not enter. `ceremony` is the player's final result (position, record, season points, placement essence and the achievements this tournament unlocked) once the tournament is completed, and null before that or for a player without a result.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(MyLightningStateSchema, "The player's state", {
								tournament: tournamentExample,
								players: 12,
								entry: { ...entryExample, presence: "paired" },
								state: "paired",
								game: {
									reservationId: "Xy3kP9aQ2mNb7RtL",
									password: "rv#Xy3kP9aQ2mNb7RtL",
									seat: 1,
									roomId: null,
									opponent,
								},
								lastGame: null,
								position: 4,
								bye: false,
								ceremony: null,
							}),
							...errorResponses(401, 403, 404),
						},
					},
				}),
		);
}

const tournaments = new LightningTournamentPostgresRepository();
const entries = new LightningEntryPostgresRepository();
const games = new LightningGamePostgresRepository();
const results = new LightningResultPostgresRepository();
const byes = new LightningByePostgresRepository();
const records = new ReservedDuelPostgresReader();
const players = new PlayerDirectoryPostgresRepository();
const transactions = new CosmeticsTransactionRunner();
const logger = new Pino();
// Lists change a few times a year; an hour keeps registrations off the network.
const LIST_CACHE_MS = 60 * 60 * 1000;

export const lightningRouter = createLightningRouter({
	authorizer: adminAuthorizer,
	requireUser: defaultRequireUser,
	clock: () => new Date(),
	defaultSeason: config.season,
	list: new ListLightningTournaments(tournaments),
	get: new GetLightningTournament(tournaments, entries, games, results, records, players, byes),
	rankings: new GetLightningRankings(results),
	enter: new EnterLightningTournament(
		tournaments,
		entries,
		new CommunityDeckLegalityChecker(
			new HttpFormatListSource(getText),
			new HttpCardAlternatesSource(getJson),
			LIST_CACHE_MS,
		),
		transactions,
	),
	withdraw: new WithdrawLightningEntry(tournaments, entries, transactions),
	pause: new PauseLightningEntry(tournaments, entries, transactions),
	resume: new ResumeLightningEntry(tournaments, entries, transactions),
	myState: new GetMyLightningState(
		tournaments,
		entries,
		games,
		records,
		players,
		buildApplyLightningGame(logger),
		transactions,
		byes,
		results,
	),
	myActive: new GetMyActiveLightningEntries(entries, records, players),
	create: new CreateLightningTournament(tournaments),
	cancel: new CancelLightningTournament(
		tournaments,
		games,
		new BunRedisReservationStore(redisClient),
		transactions,
		logger,
	),
});
