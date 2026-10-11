export type RequirementMetric = "rankedWins" | "rankedMatches" | "currentStreak" | "ladderFirstWin";

export type AchievementRequirement = {
	metric: RequirementMetric;
	target: number;
	ladder?: string;
};

const COUNTER_CODES: Array<{ pattern: RegExp; metric: RequirementMetric }> = [
	{ pattern: /^wins_(\d+)$/, metric: "rankedWins" },
	{ pattern: /^streak_(\d+)$/, metric: "currentStreak" },
	{ pattern: /^matches_(\d+)$/, metric: "rankedMatches" },
];

const FORMAT_FIRST_WIN_PREFIX = "format_first_win:";

/**
 * The requirement a gameplay achievement code stands for, or null for a code
 * this API does not know how to measure.
 */
export function requirementFromCode(code: string): AchievementRequirement | null {
	if (code === "first_win") {
		return { metric: "rankedWins", target: 1 };
	}

	if (code.startsWith(FORMAT_FIRST_WIN_PREFIX)) {
		const ladder = code.slice(FORMAT_FIRST_WIN_PREFIX.length);

		return ladder === "" ? null : { metric: "ladderFirstWin", target: 1, ladder };
	}

	for (const { pattern, metric } of COUNTER_CODES) {
		const target = Number(pattern.exec(code)?.[1]);

		if (target > 0) {
			return { metric, target };
		}
	}

	return null;
}
