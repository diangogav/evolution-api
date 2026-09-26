import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { Elysia } from "elysia";

import { CreateTournamentProxyUseCase } from "../../../../../src/modules/tournaments/application/CreateTournamentProxyUseCase";
import { GetRankingUseCase } from "../../../../../src/modules/tournaments/application/GetRankingUseCase";
import { TournamentEnrollmentUseCase } from "../../../../../src/modules/tournaments/application/TournamentEnrollmentUseCase";
import { TournamentWithdrawalUseCase } from "../../../../../src/modules/tournaments/application/TournamentWithdrawalUseCase";
import { UpdateRankingUseCase } from "../../../../../src/modules/tournaments/application/UpdateRankingUseCase";
import type { RankingWithUser } from "../../../../../src/modules/tournaments/domain/RankingWithUser";
import type { TournamentRankingRepository } from "../../../../../src/modules/tournaments/domain/TournamentRankingRepository";
import { TournamentRanking } from "../../../../../src/modules/tournaments/domain/TournamentRanking";
import type { TournamentRepository } from "../../../../../src/modules/tournaments/domain/TournamentRepository";
import { TournamentController } from "../../../../../src/modules/tournaments/infrastructure/TournamentController";
import { MessageResponseSchema } from "../../../../../src/modules/tournaments/infrastructure/swagger-schemas";
import {
	CreatedTournamentSchema,
	MatchResultAnnulledSchema,
	TournamentActionSchema,
	TournamentBracketSchema,
	TournamentEntryListSchema,
	TournamentRankingListSchema,
	UpstreamTournamentListSchema,
} from "../../../../../src/modules/tournaments/infrastructure/TournamentSchemas";
import { User } from "../../../../../src/modules/user/domain/User";
import type { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { UserProfileRole } from "../../../../../src/evolution-types/src/types/UserProfileRole";
import { JWT } from "../../../../../src/shared/JWT";
import { Logger } from "../../../../../src/shared/logger/domain/Logger";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const silentLogger: Logger = {
	debug: () => undefined,
	error: () => undefined,
	info: () => undefined,
};

const userWith = (overrides: Partial<{ id: string; participantId: string | null }> = {}): User =>
	User.from({
		id: overrides.id ?? "user-1",
		username: "Player1",
		password: "hash",
		securePassword: null,
		email: "player1@example.com",
		role: UserProfileRole.USER,
		participantId: overrides.participantId ?? null,
	});

const userRepositoryWith = (overrides: Partial<UserRepository> = {}): UserRepository => ({
	create: async () => undefined,
	findByEmailOrUsername: async () => null,
	findByEmail: async () => null,
	findByUsername: async () => null,
	findById: async () => null,
	update: async () => undefined,
	updateParticipantId: async () => undefined,
	findByParticipantId: async () => null,
	...overrides,
});

const tournamentRepositoryWith = (
	overrides: Partial<TournamentRepository> = {},
): TournamentRepository => ({
	createUserTournament: async () => "participant-new",
	enrollTournament: async () => undefined,
	withdrawTournament: async () => undefined,
	editMatchResult: async () => undefined,
	annulMatchResult: async () => undefined,
	publishTournament: async () => undefined,
	startTournament: async () => undefined,
	completeTournament: async () => undefined,
	cancelTournament: async () => undefined,
	confirmTournamentEntry: async () => undefined,
	...overrides,
});

const testJwt = new JWT({ issuer: "evolution-tests", secret: "test-secret" });

// Mounts the real TournamentController so passthrough routes run their
// actual fetch/response.json() handling; only the outbound call to the
// tournaments service is faked.
const buildTournamentApp = () => {
	const rankingRepository: TournamentRankingRepository = {
		findByUserId: async () => null,
		save: async () => undefined,
		getTopRankings: async () => [],
	};
	const userRepository = userRepositoryWith();
	const tournamentRepository = tournamentRepositoryWith();
	const controller = new TournamentController(
		new UpdateRankingUseCase(
			rankingRepository,
			userRepository,
			"https://tournaments.internal",
			silentLogger,
		),
		new GetRankingUseCase(rankingRepository),
		new CreateTournamentProxyUseCase(
			"https://tournaments.internal",
			"https://api.evolutionygo.com/api/v1/tournaments/webhook",
		),
		new TournamentEnrollmentUseCase(userRepository, tournamentRepository),
		new TournamentWithdrawalUseCase(userRepository, tournamentRepository),
		testJwt,
	);

	return new Elysia().use(controller.routes(new Elysia()));
};

const stubFetch = (body: unknown, status = 200): typeof fetch =>
	(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("TournamentActionSchema", () => {
	it("accepts the literal TournamentEnrollmentUseCase answers with, for an already-enrolled participant", async () => {
		const enrolled: { tournamentId: string; participantId: string }[] = [];
		const repository = tournamentRepositoryWith({
			enrollTournament: async (input) => {
				enrolled.push(input);
			},
		});
		const userRepository = userRepositoryWith({
			findById: async () => userWith({ participantId: "participant-1" }),
		});

		await new TournamentEnrollmentUseCase(userRepository, repository).execute({
			userId: "user-1",
			tournamentId: "tournament-1",
		});

		expect(enrolled).toEqual([{ tournamentId: "tournament-1", participantId: "participant-1" }]);
		expect(Value.Check(TournamentActionSchema, wire({ success: true }))).toBe(true);
	});

	it("accepts the literal TournamentWithdrawalUseCase answers with, creating a participant first when needed", async () => {
		const created: { displayName: string; email: string }[] = [];
		const withdrawn: { tournamentId: string; participantId: string }[] = [];
		const repository = tournamentRepositoryWith({
			createUserTournament: async (input) => {
				created.push(input);
				return "participant-created";
			},
			withdrawTournament: async (tournamentId, participantId) => {
				withdrawn.push({ tournamentId, participantId });
			},
		});
		const userRepository = userRepositoryWith({
			findById: async () => userWith({ participantId: "participant-2" }),
		});

		await new TournamentWithdrawalUseCase(userRepository, repository).execute({
			userId: "user-1",
			tournamentId: "tournament-1",
		});

		expect(created).toEqual([]);
		expect(withdrawn).toEqual([{ tournamentId: "tournament-1", participantId: "participant-2" }]);
		expect(Value.Check(TournamentActionSchema, wire({ success: true }))).toBe(true);
	});

	it("accepts the literal the webhook answers with once UpdateRankingUseCase finishes a real ranking pass", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify([
					{
						id: "match-1",
						roundNumber: 1,
						completedAt: "2025-11-24T10:00:00Z",
						participants: [
							{ participantId: "participant-winner", score: 2, result: "win" },
							{ participantId: "participant-loser", score: 1, result: "loss" },
						],
					},
				]),
				{ status: 200 },
			)) as unknown as typeof fetch;

		try {
			const saved: TournamentRanking[] = [];
			const rankingRepository: TournamentRankingRepository = {
				findByUserId: async () => null,
				getTopRankings: async () => [],
				save: async (ranking) => {
					saved.push(ranking);
				},
			};
			const userRepository = userRepositoryWith({
				findByParticipantId: async (participantId) =>
					participantId === "participant-winner"
						? userWith({ id: "winner-1" })
						: userWith({ id: "loser-1" }),
			});

			await new UpdateRankingUseCase(
				rankingRepository,
				userRepository,
				"https://tournaments.internal",
				silentLogger,
			).execute({ tournamentId: "tournament-1" });

			expect(saved.map((ranking) => ranking.toPrimitives())).toEqual([
				{ userId: "winner-1", points: 10, tournamentsWon: 1, tournamentsPlayed: 1 },
				{ userId: "loser-1", points: 7, tournamentsWon: 0, tournamentsPlayed: 1 },
			]);
			expect(Value.Check(TournamentActionSchema, wire({ success: true }))).toBe(true);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("rejects a success flag the route never sends", () => {
		expect(Value.Check(TournamentActionSchema, { success: false })).toBe(false);
	});
});

describe("MatchResultAnnulledSchema", () => {
	it("accepts the literal message the annul-result route answers with", () => {
		expect(Value.Check(MatchResultAnnulledSchema, wire({ message: "Match result annulled" }))).toBe(
			true,
		);
	});

	it("rejects a different message, such as one naming the annulled match", () => {
		expect(
			Value.Check(MatchResultAnnulledSchema, { message: "Match match-1 result annulled" }),
		).toBe(false);
	});
});

describe("TournamentRankingListSchema", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("accepts the rankings GetRankingUseCase returns, including an entry with no resolvable user", async () => {
		const rows: RankingWithUser[] = [
			{
				userId: "user-1",
				points: 15,
				tournamentsWon: 2,
				tournamentsPlayed: 4,
				user: { username: "Player1", email: "player1@example.com" },
			},
			{
				userId: "user-2",
				points: 4,
				tournamentsWon: 0,
				tournamentsPlayed: 1,
				user: null,
			},
		];
		const repository: TournamentRankingRepository = {
			findByUserId: async () => null,
			save: async () => undefined,
			getTopRankings: async () => rows,
		};

		const rankings = await new GetRankingUseCase(repository).execute(10);

		expect(Value.Check(TournamentRankingListSchema, wire(rankings))).toBe(true);
	});

	it("rejects the flat shape the old hand-written example used, without the nested user object", () => {
		expect(
			Value.Check(TournamentRankingListSchema, [
				{
					userId: "user-1",
					username: "Player1",
					email: "player1@example.com",
					points: 150,
					tournamentsWon: 5,
					tournamentsPlayed: 20,
				},
			]),
		).toBe(false);
	});
});

describe("CreatedTournamentSchema", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("accepts the tournaments service reply CreateTournamentProxyUseCase casts and returns, banlist folded into metadata", async () => {
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					id: "tournament-123",
					name: "Weekly Lightning",
					discipline: "Yu-Gi-Oh!",
					format: "SINGLE_ELIMINATION",
					status: "PUBLISHED",
					allowMixedParticipants: false,
					participantType: "PLAYER",
					maxParticipants: 8,
					description: "Weekly Lightning Tournament",
					startAt: "2025-11-24T11:33:08-04:00",
					endAt: "2025-11-24T11:33:08-04:00",
					location: "Online",
					webhookUrl: "https://api.evolutionygo.com/api/v1/tournaments/webhook",
					metadata: { banlist: "TCG" },
					createdAt: "2025-11-20T10:00:00.000Z",
					updatedAt: "2025-11-20T10:00:00.000Z",
				}),
				{ status: 201 },
			)) as unknown as typeof fetch;

		const tournament = await new CreateTournamentProxyUseCase(
			"https://tournaments.internal",
			"https://api.evolutionygo.com/api/v1/tournaments/webhook",
		).execute({
			name: "Weekly Lightning",
			discipline: "Yu-Gi-Oh!",
			format: "Single Elimination",
			status: "PUBLISHED",
			participantType: "SINGLE",
			allowMixedParticipants: false,
			maxParticipants: 8,
			banlist: "TCG",
		});

		expect(Value.Check(CreatedTournamentSchema, wire(tournament))).toBe(true);
	});

	it("rejects the old example's top-level banlist field standing in for the real nested metadata", () => {
		expect(
			Value.Check(CreatedTournamentSchema, {
				id: "tournament-123",
				name: "Weekly Lightning",
				discipline: "Yu-Gi-Oh!",
				format: "Single Elimination",
				status: "PUBLISHED",
				participantType: "SINGLE",
				allowMixedParticipants: false,
				maxParticipants: 8,
				description: "Weekly Lightning Tournament",
				startAt: "2025-11-24T11:33:08-04:00",
				endAt: "2025-11-24T11:33:08-04:00",
				location: "Online",
				banlist: "TCG",
			}),
		).toBe(false);
	});
});

describe("UpstreamTournamentListSchema", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("accepts the list the tournaments service returns from toPresentation, without webhookUrl", async () => {
		const upstreamBody = [
			{
				id: "tournament-001",
				name: "Weekly Lightning",
				description: null,
				discipline: "Yu-Gi-Oh!",
				format: "SINGLE_ELIMINATION",
				status: "PUBLISHED",
				allowMixedParticipants: false,
				participantType: "PLAYER",
				maxParticipants: 8,
				startAt: "2025-11-24T11:33:08-04:00",
				endAt: null,
				location: "Online",
				metadata: {},
				createdAt: "2025-11-20T10:00:00.000Z",
				updatedAt: "2025-11-20T10:00:00.000Z",
			},
		];
		globalThis.fetch = stubFetch(upstreamBody);

		const response = await buildTournamentApp().handle(
			new Request("http://localhost/tournaments/"),
		);
		const body = await response.json();

		expect(body).toEqual(upstreamBody);
		expect(Value.Check(UpstreamTournamentListSchema, body)).toBe(true);
	});

	it("rejects the old fictional example missing every real Tournament field but id/name/status", () => {
		expect(
			Value.Check(UpstreamTournamentListSchema, [
				{ id: "tournament-001", name: "Tournament 1", status: "open" },
			]),
		).toBe(false);
	});
});

describe("TournamentBracketSchema", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("accepts the bracket view the tournaments service returns, keyed by slot rather than by match order", async () => {
		const upstreamBody = {
			tournamentId: "tournament-001",
			rounds: [
				{
					roundNumber: 1,
					matches: [
						{
							id: "match-1",
							roundNumber: 1,
							position: 1,
							slotId: "R1-P1",
							nextMatchId: null,
							next: null,
							from: [],
							participant1: { id: "participant-1", displayName: "Player1", score: 2 },
							participant2: { id: "participant-2", displayName: "Player2", score: 1 },
							winnerId: "participant-1",
						},
					],
				},
			],
		};
		globalThis.fetch = stubFetch(upstreamBody);

		const response = await buildTournamentApp().handle(
			new Request("http://localhost/tournaments/tournament-001/bracket"),
		);
		const body = await response.json();

		expect(body).toEqual(upstreamBody);
		expect(Value.Check(TournamentBracketSchema, body)).toBe(true);
	});

	it("accepts a TBD slot, where the participant is omitted rather than null", async () => {
		const upstreamBody = {
			tournamentId: "tournament-001",
			rounds: [
				{
					roundNumber: 2,
					matches: [
						{
							id: "match-2",
							roundNumber: 2,
							position: 1,
							slotId: "R2-P1",
							nextMatchId: null,
							next: null,
							from: [{ round: 1, position: 1 }],
							winnerId: null,
						},
					],
				},
			],
		};

		expect(Value.Check(TournamentBracketSchema, upstreamBody)).toBe(true);
	});

	it("rejects the old fictional example's match/participants/completedAt shape", () => {
		expect(
			Value.Check(TournamentBracketSchema, {
				tournamentId: "tournament-001",
				rounds: [
					{
						roundNumber: 1,
						matches: [
							{
								id: "match-1",
								tournamentId: "tournament-001",
								roundNumber: 1,
								matchNumber: 1,
								participants: [
									{ participantId: "p1", displayName: "Player1", score: null, result: null },
								],
								completedAt: null,
							},
						],
					},
				],
			}),
		).toBe(false);
	});
});

describe("MessageResponseSchema reused for the bracket and match-result upstream proxies", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("accepts the message POST .../bracket answers with when it relays generate-full", async () => {
		globalThis.fetch = stubFetch({ message: "Full bracket generated" }, 201);
		const token = testJwt.generate({ id: "admin-1", role: UserProfileRole.ADMIN });

		const response = await buildTournamentApp().handle(
			new Request("http://localhost/tournaments/tournament-001/bracket", {
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		const body = await response.json();

		expect(body).toEqual({ message: "Full bracket generated" });
		expect(Value.Check(MessageResponseSchema, body)).toBe(true);
	});

	it("accepts the message POST .../matches/{matchId}/result answers with", async () => {
		globalThis.fetch = stubFetch({ message: "Result saved" });
		const token = testJwt.generate({ id: "admin-1", role: UserProfileRole.ADMIN });

		const response = await buildTournamentApp().handle(
			new Request("http://localhost/tournaments/tournament-001/matches/match-1/result", {
				method: "POST",
				headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
				body: JSON.stringify({
					participants: [
						{ participantId: "participant-1", score: 2 },
						{ participantId: "participant-2", score: 1 },
					],
				}),
			}),
		);
		const body = await response.json();

		expect(body).toEqual({ message: "Result saved" });
		expect(Value.Check(MessageResponseSchema, body)).toBe(true);
	});

	it("rejects the old fictional full-match-entity example neither route ever sends", () => {
		expect(
			Value.Check(MessageResponseSchema, {
				id: "match-1",
				tournamentId: "tournament-001",
				roundNumber: 1,
				participants: [],
				completedAt: "2025-11-24T10:00:00Z",
			}),
		).toBe(false);
	});
});

describe("TournamentEntryListSchema", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("accepts the entries the tournaments service lists, including the joined participant name", async () => {
		const upstreamBody = [
			{
				id: "entry-123",
				tournamentId: "tournament-001",
				participantId: "participant-1",
				status: "CONFIRMED",
				groupId: null,
				seed: 1,
				metadata: {},
				createdAt: "2025-11-20T10:00:00.000Z",
				updatedAt: "2025-11-20T10:00:00.000Z",
				participantName: "Player1",
			},
		];
		globalThis.fetch = stubFetch(upstreamBody);

		const response = await buildTournamentApp().handle(
			new Request("http://localhost/tournaments/tournament-001/entries"),
		);
		const body = await response.json();

		expect(body).toEqual(upstreamBody);
		expect(Value.Check(TournamentEntryListSchema, body)).toBe(true);
	});

	it("rejects the old wrapped {entries:[...]} example with a userId field no entry has", () => {
		expect(
			Value.Check(TournamentEntryListSchema, {
				entries: [
					{
						id: "123",
						userId: "456",
						tournamentId: "789",
						createdAt: "2023-01-01T00:00:00.000Z",
						updatedAt: "2023-01-01T00:00:00.000Z",
					},
				],
			}),
		).toBe(false);
	});
});
