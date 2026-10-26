import { t } from "elysia";

import { MISSION_METRICS } from "../domain/Mission";

export const MissionRewardSchema = t.Union([
	t.Object({ type: t.Literal("essence"), amount: t.Integer() }),
	t.Object({ type: t.Literal("cosmetic"), cosmeticId: t.String() }),
]);

export const MissionViewSchema = t.Object({
	code: t.String(),
	metric: t.UnionEnum([...MISSION_METRICS], {
		description: "What the mission counts; clients pick the mission icon from it",
	}),
	name: t.String({ description: "Localized from Accept-Language (en or es)" }),
	description: t.String(),
	target: t.Integer(),
	value: t.Integer(),
	reward: MissionRewardSchema,
	completed: t.Boolean(),
	claimed: t.Boolean(),
});

export const ClaimResultSchema = t.Object({
	balance: t.Integer({ description: "Essence balance after the claim" }),
	reward: MissionRewardSchema,
	dailyBonus: t.Integer({
		description:
			"Daily bonus essence credited by this claim (the third daily claim of the day); 0 otherwise",
	}),
});
