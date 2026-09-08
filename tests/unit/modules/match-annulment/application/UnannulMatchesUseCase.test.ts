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

describe("UnannulMatchesUseCase", () => {
	it("rejects an empty game id list before touching the repository", async () => {
		const useCase = new UnannulMatchesUseCase(repo({}), true);
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
		const useCase = new UnannulMatchesUseCase(repository, false);
		await expect(useCase.run({ gameIds: ["game-1"] })).rejects.toThrow(ConflictError);
		expect(calls).toBe(0);
	});

	it("reports not-found, not-annulled and conflict per game, isolating one game's infra failure", async () => {
		const repository: MatchAnnulmentRepository = {
			annulPhaseOne: async () => ({ outcome: "not-found" }),
			unannulPhaseOne: async (gameId: string) => {
				if (gameId === "game-1") return { outcome: "not-found" };
				if (gameId === "game-2") return { outcome: "not-annulled" };
				if (gameId === "game-3") return { outcome: "conflict", reason: "summary-key-mismatch" };
				throw new Error("connection reset");
			},
		};
		const useCase = new UnannulMatchesUseCase(repository, true);
		const response = await useCase.run({ gameIds: ["game-1", "game-2", "game-3", "game-4"] });
		expect(response.results).toEqual([
			row(),
			row({ gameId: "game-2", outcome: "not-annulled" }),
			row({ gameId: "game-3", outcome: "conflict", reason: "summary-key-mismatch" }),
			row({ gameId: "game-4", outcome: "conflict", reason: "connection reset" }),
		]);
	});

	it("reports un-annulled with pointsRows from touched keys, eloReinstated explicitly 0", async () => {
		const fixture: PhaseOneResult = {
			outcome: "un-annulled",
			touchedKeys: [KEY, { ...KEY, userId: "user-2" }],
			reversed: true,
		};
		const useCase = new UnannulMatchesUseCase(repo({ "game-1": fixture }), true);
		const response = await useCase.run({ gameIds: ["game-1"] });
		expect(response.results).toEqual([row({ outcome: "un-annulled", pointsRows: 2 })]);
		expect(response.totals).toEqual({ eloReinstated: 0 });
	});
});
