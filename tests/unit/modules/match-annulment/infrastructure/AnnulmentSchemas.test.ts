import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { AnnulMatchesUseCase } from "../../../../../src/modules/match-annulment/application/AnnulMatchesUseCase";
import { UnannulMatchesUseCase } from "../../../../../src/modules/match-annulment/application/UnannulMatchesUseCase";
import type { MatchAnnulmentRepository } from "../../../../../src/modules/match-annulment/domain/MatchAnnulmentRepository";
import type { PhaseOneResult } from "../../../../../src/modules/match-annulment/domain/PhaseOneResult";
import {
	AnnulMatchesResultSchema,
	UnannulMatchesResultSchema,
} from "../../../../../src/modules/match-annulment/infrastructure/AnnulmentSchemas";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const REQUEST = {
	gameIds: ["game-1", "game-2", "game-3", "game-4"],
	reason: "cheating",
	offenderUserId: "user-1",
	adminUserId: "admin-1",
};
const KEY = { userId: "user-1", rankId: "rank-global", season: 5 };

describe("AnnulMatchesResultSchema", () => {
	it("accepts every outcome AnnulMatchesUseCase can report in one batch", async () => {
		const repository: MatchAnnulmentRepository = {
			annulPhaseOne: async (request) => {
				const byGame: Record<string, PhaseOneResult> = {
					"game-1": { outcome: "annulled", touchedKeys: [KEY], reversed: true },
					"game-2": { outcome: "already" },
					"game-3": { outcome: "not-found" },
					"game-4": { outcome: "conflict", reason: "summary-key-mismatch" },
				};
				return byGame[request.gameId] ?? { outcome: "not-found" };
			},
			unannulPhaseOne: async () => ({ outcome: "not-found" }),
		};
		const compensator = { compensate: async () => ({ reversed: 1, skipped: 0 }) };

		const response = await new AnnulMatchesUseCase(repository, compensator, true).run(REQUEST);

		expect(Value.Check(AnnulMatchesResultSchema, wire(response))).toBe(true);
	});

	it("accepts the partial outcome reported when Elo compensation fails for one game", async () => {
		const repository: MatchAnnulmentRepository = {
			annulPhaseOne: async () => ({ outcome: "annulled", touchedKeys: [KEY], reversed: true }),
			unannulPhaseOne: async () => ({ outcome: "not-found" }),
		};
		const compensator = {
			compensate: async () => {
				throw new Error("rating service unavailable");
			},
		};

		const response = await new AnnulMatchesUseCase(repository, compensator, true).run({
			...REQUEST,
			gameIds: ["game-1"],
		});

		expect(Value.Check(AnnulMatchesResultSchema, wire(response))).toBe(true);
		expect((response.results[0] as { outcome: string }).outcome).toBe("partial");
	});

	it("rejects a result using an outcome literal this route never produces", () => {
		expect(
			Value.Check(AnnulMatchesResultSchema, {
				results: [
					{
						gameId: "game-1",
						outcome: "un-annulled",
						pointsRows: 0,
						eloReversed: 0,
						eloSkipped: 0,
						eloReinstated: 0,
					},
				],
				totals: { eloReversed: 0, eloSkipped: 0 },
			}),
		).toBe(false);
	});
});

describe("UnannulMatchesResultSchema", () => {
	it("accepts every outcome UnannulMatchesUseCase can report in one batch", async () => {
		const repository: MatchAnnulmentRepository = {
			annulPhaseOne: async () => ({ outcome: "not-found" }),
			unannulPhaseOne: async (gameId) => {
				const byGame: Record<string, PhaseOneResult> = {
					"game-1": { outcome: "un-annulled", touchedKeys: [KEY], reversed: true },
					"game-2": { outcome: "not-annulled" },
					"game-3": { outcome: "not-found" },
					"game-4": { outcome: "conflict", reason: "summary-key-mismatch" },
				};
				return byGame[gameId] ?? { outcome: "not-found" };
			},
		};
		const compensator = { reinstate: async () => ({ reinstated: 1, skipped: 0 }) };

		const response = await new UnannulMatchesUseCase(repository, compensator, true).run({
			gameIds: ["game-1", "game-2", "game-3", "game-4"],
		});

		expect(Value.Check(UnannulMatchesResultSchema, wire(response))).toBe(true);
	});

	it("rejects a result using an outcome literal this route never produces", () => {
		expect(
			Value.Check(UnannulMatchesResultSchema, {
				results: [
					{
						gameId: "game-1",
						outcome: "annulled",
						pointsRows: 0,
						eloReversed: 0,
						eloSkipped: 0,
						eloReinstated: 0,
					},
				],
				totals: { eloReinstated: 0, eloSkipped: 0 },
			}),
		).toBe(false);
	});
});
