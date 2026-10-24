import { describe, expect, it } from "bun:test";

import { GetMyMissions } from "../../../../../src/modules/rewards/application/GetMyMissions";
import { Mission } from "../../../../../src/modules/rewards/domain/Mission";
import { MissionClaimRepository } from "../../../../../src/modules/rewards/domain/MissionClaimRepository";
import { MissionCatalogRepository } from "../../../../../src/modules/rewards/domain/MissionCatalogRepository";
import {
	ProgressRow,
	RewardsProjectionRepository,
} from "../../../../../src/modules/rewards/domain/RewardsProjectionRepository";
import { selectDailyMissions } from "../../../../../src/modules/rewards/domain/selectDailyMissions";

function mission(code: string, period: Mission["period"] = "daily"): Mission {
	return {
		id: `id-${code}`,
		code,
		name: { en: `${code} en`, es: `${code} es` },
		description: { en: `${code} desc en` },
		period,
		rule: { metric: "duelsPlayed", target: 3 },
		reward: { type: "essence", amount: 20 },
		active: true,
		sortOrder: 0,
	};
}

const catalog = [
	mission("play_3"),
	mission("win_1"),
	mission("ranked_play_1"),
	mission("win_other_format"),
	mission("win_fast"),
	mission("weekly_play_20", "weekly"),
];

const now = new Date("2026-10-23T10:00:00Z");

function useCase(progress: ProgressRow[] = [], claimed: string[] = []) {
	const catalogRepository: MissionCatalogRepository = { findActive: async () => catalog };
	const projection = {
		loadProgress: async (_userId: string, pairs: Array<{ missionId: string }>) =>
			progress.filter((row) => pairs.some((pair) => pair.missionId === row.missionId)),
	} as unknown as RewardsProjectionRepository;
	const claims = {
		findClaimedMissionIds: async () => claimed,
	} as unknown as MissionClaimRepository;
	return new GetMyMissions(catalogRepository, projection, claims);
}

describe("GetMyMissions", () => {
	it("returns the day's three daily missions localized, with progress and claim state", async () => {
		const todays = selectDailyMissions(catalog, "2026-10-23");
		const first = todays[0];
		const result = await useCase(
			[{ missionId: first.id, periodKey: "2026-10-23", value: 3, completed: true }],
			[first.id],
		).run({ userId: "user-1", period: "daily", locale: "es", now });

		expect(result.map((m) => m.code)).toEqual(todays.map((m) => m.code));
		expect(result[0]).toEqual({
			code: first.code,
			name: `${first.code} es`,
			description: `${first.code} desc en`,
			target: 3,
			value: 3,
			reward: { type: "essence", amount: 20 },
			completed: true,
			claimed: true,
		});
		expect(result[1]).toMatchObject({ value: 0, completed: false, claimed: false });
	});

	it("returns every active weekly mission for the current ISO week", async () => {
		const result = await useCase().run({ userId: "user-1", period: "weekly", locale: "en", now });

		expect(result).toEqual([
			expect.objectContaining({ code: "weekly_play_20", name: "weekly_play_20 en" }),
		]);
	});
});
