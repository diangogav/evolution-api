import { describe, expect, it } from "bun:test";

import { achievementCredit } from "../../../../../src/modules/rewards/domain/achievementCredit";

const unlock = {
	sourceId: "ua-1",
	createdAt: "2026-10-23 10:00:05.000001",
	userId: "user-1",
	essenceReward: 150,
};

describe("achievementCredit", () => {
	it("credits the achievement's essence reward, keyed by the user_achievements row id", () => {
		expect(achievementCredit(unlock)).toEqual({
			userId: "user-1",
			kind: "achievement",
			referenceKey: "ua-1",
			delta: 150,
		});
	});

	it("credits nothing for an achievement whose reward is zero", () => {
		expect(achievementCredit({ ...unlock, essenceReward: 0 })).toBeNull();
	});
});
