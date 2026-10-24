import { describe, expect, it } from "bun:test";

import {
	ACHIEVEMENT_ESSENCE_MULTIPLIER,
	achievementCredit,
} from "../../../../../src/modules/rewards/domain/achievementCredit";

const unlock = {
	sourceId: "ua-1",
	createdAt: "2026-10-23 10:00:05.000001",
	userId: "user-1",
	earnedPoints: 15,
};

describe("achievementCredit", () => {
	it("credits twice the achievement's points, keyed by the user_achievements row id", () => {
		expect(ACHIEVEMENT_ESSENCE_MULTIPLIER).toBe(2);
		expect(achievementCredit(unlock)).toEqual({
			userId: "user-1",
			kind: "achievement",
			referenceKey: "ua-1",
			delta: 30,
		});
	});

	it("credits nothing for an achievement worth zero points", () => {
		expect(achievementCredit({ ...unlock, earnedPoints: 0 })).toBeNull();
	});
});
