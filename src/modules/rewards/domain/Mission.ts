import { LocalizedText } from "./LocalizedText";

export type MissionPeriod = "daily" | "weekly";

export const MISSION_METRICS = [
	"duelsPlayed",
	"duelsWon",
	"rankedDuelsPlayed",
	"rankedWinStreak",
	"winUnder10Turns",
	"winDifferentFormat",
] as const;

export type MissionMetric = (typeof MISSION_METRICS)[number];

// `ranked` restricts any metric to ranked matches; the ranked* metrics imply it.
export type MissionRule = {
	metric: MissionMetric;
	target: number;
	ranked?: boolean;
};

export type MissionReward =
	| { type: "essence"; amount: number }
	| { type: "cosmetic"; cosmeticId: string };

export type Mission = {
	id: string;
	code: string;
	name: LocalizedText;
	description: LocalizedText;
	period: MissionPeriod;
	rule: MissionRule;
	reward: MissionReward;
	active: boolean;
	sortOrder: number;
};
