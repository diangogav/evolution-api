import { describe, expect, it } from "bun:test";

import {
	INITIAL_RATING,
	RATING_FLOOR,
	effectiveDelta,
	projectRating,
} from "../../../../../src/modules/rating/domain/RatingProjection";

describe("effectiveDelta", () => {
	it("returns the delta untouched while the result stays above the floor", () => {
		expect(effectiveDelta(1000, -15)).toBe(-15);
		expect(effectiveDelta(1000, 15)).toBe(15);
	});

	it("returns only the part the floor admits when the delta would break through it", () => {
		expect(effectiveDelta(105, -15)).toBe(-5);
		expect(effectiveDelta(RATING_FLOOR, -30)).toBe(0);
	});

	it("never truncates a delta that raises the rating", () => {
		expect(effectiveDelta(RATING_FLOOR, 30)).toBe(30);
	});
});

describe("projectRating", () => {
	it("starts an empty history at the initial rating and peak", () => {
		expect(projectRating([])).toEqual({
			rating: INITIAL_RATING,
			gamesPlayed: 0,
			peak: INITIAL_RATING,
		});
	});

	it("lands on the rating the live path stored for a history containing a floored row", () => {
		// -890 drops the player to 110; the Elo curve then asked for -30 but the
		// rating only absorbed -10, which is what the row stores.
		const projected = projectRating([
			{ kind: "applied", delta: -890 },
			{ kind: "applied", delta: -10 },
		]);

		expect(projected.rating).toBe(RATING_FLOOR);
	});

	it("returns to the pre-loss rating when the floored row is reversed by the delta it absorbed", () => {
		const projected = projectRating([
			{ kind: "applied", delta: -890 },
			{ kind: "applied", delta: -10 },
			{ kind: "reversal", delta: 10 },
		]);

		expect(projected.rating).toBe(110);
		expect(projected.gamesPlayed).toBe(1);
	});

	it("keeps the sum independent of the order the rows come back in", () => {
		const rows = [
			{ kind: "applied" as const, delta: -890 },
			{ kind: "applied" as const, delta: -10 },
			{ kind: "reversal" as const, delta: 10 },
		];

		expect(projectRating([...rows].reverse()).rating).toBe(projectRating(rows).rating);
	});

	it("recomputes peak from the whole history instead of trusting a stored one", () => {
		const projected = projectRating([
			{ kind: "applied", delta: 80 },
			{ kind: "reversal", delta: -80 },
		]);

		expect(projected).toEqual({ rating: 1000, gamesPlayed: 0, peak: 1080 });
	});

	it("never reports negative games played when reversals outnumber applied rows", () => {
		expect(projectRating([{ kind: "reversal", delta: -15 }]).gamesPlayed).toBe(0);
	});
});
