import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { CreateTournamentProxyUseCase } from "../../../../../src/modules/tournaments/application/CreateTournamentProxyUseCase";
import { GetRankingUseCase } from "../../../../../src/modules/tournaments/application/GetRankingUseCase";
import { TournamentEnrollmentUseCase } from "../../../../../src/modules/tournaments/application/TournamentEnrollmentUseCase";
import { TournamentWithdrawalUseCase } from "../../../../../src/modules/tournaments/application/TournamentWithdrawalUseCase";
import { UpdateRankingUseCase } from "../../../../../src/modules/tournaments/application/UpdateRankingUseCase";
import type { RankingWithUser } from "../../../../../src/modules/tournaments/domain/RankingWithUser";
import type { TournamentRankingRepository } from "../../../../../src/modules/tournaments/domain/TournamentRankingRepository";
import { TournamentRanking } from "../../../../../src/modules/tournaments/domain/TournamentRanking";
import type { TournamentRepository } from "../../../../../src/modules/tournaments/domain/TournamentRepository";
import {
	CreatedTournamentSchema,
	MatchResultAnnulledSchema,
	TournamentActionSchema,
	TournamentRankingListSchema,
} from "../../../../../src/modules/tournaments/infrastructure/TournamentSchemas";
import { User } from "../../../../../src/modules/user/domain/User";
import type { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { UserProfileRole } from "../../../../../src/evolution-types/src/types/UserProfileRole";
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
					format: "Single Elimination",
					status: "PUBLISHED",
					allowMixedParticipants: false,
					participantType: "SINGLE",
					maxParticipants: 8,
					description: "Weekly Lightning Tournament",
					startAt: "2025-11-24T11:33:08-04:00",
					endAt: "2025-11-24T11:33:08-04:00",
					location: "Online",
					webhookUrl: "https://api.evolutionygo.com/api/v1/tournaments/webhook",
					metadata: { banlist: "TCG" },
				}),
				{ status: 200 },
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
