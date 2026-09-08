import { describe, expect, it } from "bun:test";

import { UnannulMatchesUseCase } from "../../../../../src/modules/match-annulment/application/UnannulMatchesUseCase";
import type { UnannulGameResult } from "../../../../../src/modules/match-annulment/application/dtos/UnannulMatches";
import type { MatchAnnulmentRepository } from "../../../../../src/modules/match-annulment/domain/MatchAnnulmentRepository";
import type { PhaseOneResult } from "../../../../../src/modules/match-annulment/domain/PhaseOneResult";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";

const KEY = { userId: "user-1", rankId: "rank-global", season: 5 };

function row(overrides: Partial<UnannulGameResult> = {}): UnannulGameResult {
	return {
		gameId: "game-1",
		outcome: "not-found",
		pointsRows: 0,
		eloReversed: 0,
		eloSkipped: 0,
		eloReinstated: 0,
		...overrides,
	};
}

function repo(byGame: Record<string, PhaseOneResult>): MatchAnnulmentRepository {
	return {
		annulPhaseOne: async () => {
			throw new Error("not used by UnannulMatchesUseCase");
		},
		unannulPhaseOne: async (gameId: string) => {
			const found = byGame[gameId];
			if (!found) throw new Error(`no fixture for ${gameId}`);
			return found;
		},
	};
}

function elo(fn: (id: string) => Promise<{ reinstated: number; skipped: number }>) {
	return { reinstate: fn };
}

const NO_ELO = elo(async () => ({ reinstated: 0, skipped: 0 }));

describe("UnannulMatchesUseCase", () => {
	it("rejects an empty game id list before touching the repository", async () => {
		const useCase = new UnannulMatchesUseCase(repo({}), NO_ELO, true);
		await expect(useCase.run({ gameIds: [] })).rejects.toThrow(InvalidArgumentError);
	});

	it("refuses the batch when annulment is disabled, before processing any game", async () => {
		let calls = 0;
		const repository: MatchAnnulmentRepository = {
			annulPhaseOne: async () => ({ outcome: "not-found" }),
			unannulPhaseOne: async () => {
				calls++;
				return { outcome: "not-found" };
			},
		};
		const useCase = new UnannulMatchesUseCase(repository, NO_ELO, false);
		await expect(useCase.run({ gameIds: ["game-1"] })).rejects.toThrow(ConflictError);
		expect(calls).toBe(0);
	});

	it("reports not-found and conflict without running Elo, isolating one game's infra failure", async () => {
		let compensated = false;
		const repository: MatchAnnulmentRepository = {
			annulPhaseOne: async () => ({ outcome: "not-found" }),
			unannulPhaseOne: async (gameId: string) => {
				if (gameId === "game-1") return { outcome: "not-found" };
				if (gameId === "game-2") return { outcome: "conflict", reason: "summary-key-mismatch" };
				throw new Error("connection reset");
			},
		};
		const useCase = new UnannulMatchesUseCase(
			repository,
			elo(async () => {
				compensated = true;
				return { reinstated: 0, skipped: 0 };
			}),
			true,
		);
		const response = await useCase.run({ gameIds: ["game-1", "game-2", "game-3"] });
		expect(response.results).toEqual([
			row(),
			row({ gameId: "game-2", outcome: "conflict", reason: "summary-key-mismatch" }),
			row({ gameId: "game-3", outcome: "conflict", reason: "connection reset" }),
		]);
		expect(compensated).toBe(false);
	});

	it("runs Elo for un-annulled and not-annulled (repair path), reporting partial on Elo failure", async () => {
		const useCase = new UnannulMatchesUseCase(
			repo({
				"game-1": {
					outcome: "un-annulled",
					touchedKeys: [KEY, { ...KEY, userId: "user-2" }],
					reversed: true,
				},
				"game-2": { outcome: "not-annulled" },
				"game-3": { outcome: "un-annulled", touchedKeys: [KEY], reversed: true },
			}),
			elo(async (id) => {
				if (id === "game-3") throw new Error("rating service unavailable");
				return id === "game-1" ? { reinstated: 2, skipped: 0 } : { reinstated: 1, skipped: 0 };
			}),
			true,
		);
		const response = await useCase.run({ gameIds: ["game-1", "game-2", "game-3"] });
		expect(response.results).toEqual([
			row({ outcome: "un-annulled", pointsRows: 2, eloReinstated: 2 }),
			row({ gameId: "game-2", outcome: "not-annulled", eloReinstated: 1 }),
			row({
				gameId: "game-3",
				outcome: "partial",
				pointsRows: 1,
				error: "rating service unavailable",
			}),
		]);
		expect(response.totals).toEqual({ eloReinstated: 3, eloSkipped: 0 });
	});
});
