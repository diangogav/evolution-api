import { describe, expect, it } from "bun:test";

import { AnnulMatchesUseCase } from "../../../../../src/modules/match-annulment/application/AnnulMatchesUseCase";
import { UnannulMatchesUseCase } from "../../../../../src/modules/match-annulment/application/UnannulMatchesUseCase";
import type { MatchAnnulmentRepository } from "../../../../../src/modules/match-annulment/domain/MatchAnnulmentRepository";
import { AnnulledMatchRatingCompensator } from "../../../../../src/modules/rating/application/AnnulledMatchRatingCompensator";
import { ReinstatedMatchRatingCompensator } from "../../../../../src/modules/rating/application/ReinstatedMatchRatingCompensator";
import {
	AppliedRatingHistoryRecord,
	OpenReversalRecord,
	RatingCompensationRepository,
} from "../../../../../src/modules/rating/domain/RatingCompensationRepository";
import {
	effectiveDelta,
	projectRating,
} from "../../../../../src/modules/rating/domain/RatingProjection";

const KEY = { userId: "user-1", rankId: "rank-global", season: 5 };
const REQUEST = {
	gameIds: ["match-1"],
	reason: "cheating",
	offenderUserId: "user-1",
	adminUserId: "admin-1",
};

// Real phase-1 state machine so the use cases exercise genuine repair-path
// branching; only the SQL layer is faked below.
function fakeMatchAnnulmentRepository(): MatchAnnulmentRepository {
	let flagged = false;
	return {
		annulPhaseOne: async () => {
			if (flagged) return { outcome: "already" };
			flagged = true;
			return { outcome: "annulled", touchedKeys: [KEY], reversed: false };
		},
		unannulPhaseOne: async () => {
			if (!flagged) return { outcome: "not-annulled" };
			flagged = false;
			return { outcome: "un-annulled", touchedKeys: [KEY], reversed: true };
		},
	};
}

type Kind = "applied" | "reversal" | "reinstatement";
type Row = AppliedRatingHistoryRecord & { kind: Kind; cycle: number };

const sameSlot = (a: Row, b: { matchId: string; userId: string; rankId: string }) =>
	a.matchId === b.matchId && a.userId === b.userId && a.rankId === b.rankId;

// Mirrors RatingCompensationPostgresRepository's cycle derivation and
// idempotent-insert contract, reusing the real floor-math functions.
class FakeRatingCompensationRepository implements RatingCompensationRepository {
	private rows: Row[] = [];

	seedApplied(row: AppliedRatingHistoryRecord): void {
		this.rows.push({ ...row, kind: "applied", cycle: 0 });
	}

	rowsOfKind = (kind: Kind): Row[] => this.rows.filter((r) => r.kind === kind);

	async findAppliedHistory(matchId: string): Promise<AppliedRatingHistoryRecord[]> {
		return this.rows.filter((r) => r.matchId === matchId && r.kind === "applied");
	}

	async insertReversal(entry: AppliedRatingHistoryRecord, delta: number): Promise<boolean> {
		return this.insert(entry, delta, "reversal", this.countOfKind(entry, "reinstatement"));
	}

	async findOpenReversals(matchId: string): Promise<OpenReversalRecord[]> {
		return this.rows
			.filter((r) => r.matchId === matchId && r.kind === "reversal")
			.filter(
				(r) =>
					!this.rows.some(
						(c) => sameSlot(c, r) && c.kind === "reinstatement" && c.cycle === r.cycle,
					),
			);
	}

	async insertReinstatement(entry: OpenReversalRecord, delta: number): Promise<boolean> {
		return this.insert(entry, delta, "reinstatement", this.countOfKind(entry, "reversal") - 1);
	}

	private countOfKind(entry: AppliedRatingHistoryRecord, kind: Kind): number {
		return this.rows.filter((r) => sameSlot(r, entry) && r.kind === kind).length;
	}

	private insert(
		entry: AppliedRatingHistoryRecord,
		delta: number,
		kind: Kind,
		cycle: number,
	): boolean {
		if (this.rows.some((r) => sameSlot(r, entry) && r.kind === kind && r.cycle === cycle))
			return false;

		const history = this.rows.filter(
			(r) => r.userId === entry.userId && r.rankId === entry.rankId && r.season === entry.season,
		);
		const previousRating = projectRating(history).rating;
		this.rows.push({
			...entry,
			kind,
			cycle,
			previousRating,
			delta: effectiveDelta(previousRating, delta),
		});
		return true;
	}
}

describe("annul -> un-annul -> annul rating cycle (end-to-end at the use-case level, with fakes)", () => {
	it("reverses Elo a second time with a distinct cycle-1 reversal, not a skip", async () => {
		const matchRepo = fakeMatchAnnulmentRepository();
		const ratingRepo = new FakeRatingCompensationRepository();
		ratingRepo.seedApplied({
			matchId: "match-1",
			userId: "user-1",
			rankId: "rank-global",
			season: 5,
			previousRating: 1000,
			delta: 15,
			kFactor: 40,
			opponentRating: 1000,
		});

		const annulUseCase = new AnnulMatchesUseCase(
			matchRepo,
			new AnnulledMatchRatingCompensator(ratingRepo),
			true,
		);
		const unannulUseCase = new UnannulMatchesUseCase(
			matchRepo,
			new ReinstatedMatchRatingCompensator(ratingRepo),
			true,
		);

		const firstAnnul = await annulUseCase.run(REQUEST);
		expect(firstAnnul.results[0]).toMatchObject({
			outcome: "annulled",
			eloReversed: 1,
			eloSkipped: 0,
		});

		const unannul = await unannulUseCase.run({ gameIds: ["match-1"] });
		expect(unannul.results[0]).toMatchObject({
			outcome: "un-annulled",
			eloReinstated: 1,
			eloSkipped: 0,
		});

		const secondAnnul = await annulUseCase.run(REQUEST);
		expect(secondAnnul.results[0]).toMatchObject({
			outcome: "annulled",
			eloReversed: 1,
			eloSkipped: 0,
		});

		const reversals = ratingRepo.rowsOfKind("reversal");
		expect(reversals).toHaveLength(2);
		expect(reversals.map((r) => r.cycle).sort()).toEqual([0, 1]);
	});
});
