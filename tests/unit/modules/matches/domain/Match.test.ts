import { describe, expect, it } from "bun:test";

import { Match } from "../../../../../src/modules/match/domain/Match";
import { MatchMother } from "../mothers/MatchMother";

describe("Match", () => {
	it("carries the annulment flag and reason when the match was annulled", () => {
		const match = MatchMother.create({ anulled: true, anulledReason: "duplicate account farming" });

		expect(match.anulled).toBe(true);
		expect(match.anulledReason).toBe("duplicate account farming");
		expect(match.toJson().anulled).toBe(true);
		expect(match.toJson().anulledReason).toBe("duplicate account farming");
	});

	it("defaults to not annulled with no reason when the match was never annulled", () => {
		const match = MatchMother.create({ anulled: false, anulledReason: null });

		expect(match.anulled).toBe(false);
		expect(match.anulledReason).toBeNull();
		expect(match.toJson().anulled).toBe(false);
		expect(match.toJson().anulledReason).toBeNull();
	});
});
