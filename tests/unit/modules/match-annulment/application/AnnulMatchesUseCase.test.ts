import { describe, expect, it } from "bun:test";

import { AnnulMatchesUseCase } from "../../../../../src/modules/match-annulment/application/AnnulMatchesUseCase";
import type { AnnulGameResult } from "../../../../../src/modules/match-annulment/application/dtos/AnnulMatches";
import type { AnnulmentRequest } from "../../../../../src/modules/match-annulment/domain/AnnulmentRequest";
import type { MatchAnnulmentRepository } from "../../../../../src/modules/match-annulment/domain/MatchAnnulmentRepository";
import type { PhaseOneResult } from "../../../../../src/modules/match-annulment/domain/PhaseOneResult";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";

const REQUEST = {
	gameIds: ["game-1"],
	reason: "cheating",
	offenderUserId: "user-1",
	adminUserId: "admin-1",
};
const KEY = { userId: "user-1", rankId: "rank-global", season: 5 };

function row(overrides: Partial<AnnulGameResult> = {}): AnnulGameResult {
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
		annulPhaseOne: async (r: AnnulmentRequest) => {
			const found = byGame[r.gameId];
			if (!found) throw new Error(`no fixture for ${r.gameId}`);
			return found;
		},
		unannulPhaseOne: async () => ({ outcome: "not-found" }),
	};
}

function elo(fn: (id: string) => Promise<{ reversed: number; skipped: number }>) {
	return { compensate: fn };
}

const NO_ELO = elo(async () => ({ reversed: 0, skipped: 0 }));

describe("AnnulMatchesUseCase", () => {
	it("rejects an empty game id list or a blank reason before touching the repository", async () => {
		const useCase = new AnnulMatchesUseCase(repo({}), NO_ELO, true);
		await expect(useCase.run({ ...REQUEST, gameIds: [] })).rejects.toThrow(InvalidArgumentError);
		await expect(useCase.run({ ...REQUEST, reason: "  " })).rejects.toThrow(InvalidArgumentError);
	});

	it("refuses the batch when annulment is disabled, before processing any game", async () => {
		let calls = 0;
		const repository: MatchAnnulmentRepository = {
			annulPhaseOne: async () => {
				calls++;
				return { outcome: "not-found" };
			},
			unannulPhaseOne: async () => ({ outcome: "not-found" }),
		};
		const useCase = new AnnulMatchesUseCase(repository, NO_ELO, false);
		await expect(useCase.run(REQUEST)).rejects.toThrow(ConflictError);
		expect(calls).toBe(0);
	});

	it("reports not-found and conflict without running Elo, and isolates one game's infra failure", async () => {
		let compensated = false;
		const repository: MatchAnnulmentRepository = {
			annulPhaseOne: async (r: AnnulmentRequest) => {
				if (r.gameId === "game-1") return { outcome: "not-found" };
				if (r.gameId === "game-2") return { outcome: "conflict", reason: "summary-key-mismatch" };
				throw new Error("connection reset");
			},
			unannulPhaseOne: async () => ({ outcome: "not-found" }),
		};
		const useCase = new AnnulMatchesUseCase(
			repository,
			elo(async () => {
				compensated = true;
				return { reversed: 0, skipped: 0 };
			}),
			true,
		);
		const response = await useCase.run({ ...REQUEST, gameIds: ["game-1", "game-2", "game-3"] });
		expect(response.results).toEqual([
			row(),
			row({ gameId: "game-2", outcome: "conflict", reason: "summary-key-mismatch" }),
			row({ gameId: "game-3", outcome: "conflict", reason: "connection reset" }),
		]);
		expect(compensated).toBe(false);
	});

	it("runs Elo for annulled and already (repair path), reporting partial on Elo failure", async () => {
		const useCase = new AnnulMatchesUseCase(
			repo({
				"game-1": {
					outcome: "annulled",
					touchedKeys: [KEY, { ...KEY, userId: "user-2" }],
					reversed: true,
				},
				"game-2": { outcome: "already" },
				"game-3": { outcome: "annulled", touchedKeys: [KEY], reversed: true },
			}),
			elo(async (id) => {
				if (id === "game-3") throw new Error("rating service unavailable");
				return id === "game-1" ? { reversed: 2, skipped: 0 } : { reversed: 1, skipped: 0 };
			}),
			true,
		);
		const response = await useCase.run({ ...REQUEST, gameIds: ["game-1", "game-2", "game-3"] });
		expect(response.results).toEqual([
			row({ outcome: "annulled", pointsRows: 2, eloReversed: 2 }),
			row({ gameId: "game-2", outcome: "already", eloReversed: 1 }),
			row({
				gameId: "game-3",
				outcome: "partial",
				pointsRows: 1,
				error: "rating service unavailable",
			}),
		]);
		expect(response.totals).toEqual({ eloReversed: 3, eloSkipped: 0 });
	});
});
