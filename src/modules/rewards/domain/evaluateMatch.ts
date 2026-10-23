import { Mission, MissionMetric } from "./Mission";
import { periodKey } from "./MissionPeriod";

export type DuelFacts = { result: "winner" | "loser" | "deuce"; turns: number };

// One finished match as seen from one user. Built by the worker from the matches and
// duels rows of that user; carries no reference to storage.
export type MatchFacts = {
	gameId: string;
	userId: string;
	won: boolean;
	ranked: boolean;
	banListName: string;
	date: Date;
	duels: DuelFacts[];
};

// What the engine needs to remember between matches of one user. `progress` holds the
// current value per mission code for the periods the match falls in; the caller loads
// only the relevant keys. `lastFormat` and `rankedStreak` span periods.
export type RewardState = {
	progress: Record<string, number>;
	lastFormat: string | null;
	rankedStreak: number;
};

export type MissionProgress = {
	missionCode: string;
	periodKey: string;
	value: number;
	completed: boolean;
};

export type EvaluationResult = {
	progress: MissionProgress[];
	state: RewardState;
};

export const FAST_WIN_MAX_TURNS = 10;

export function evaluateMatch(
	facts: MatchFacts,
	state: RewardState,
	missions: Mission[],
): EvaluationResult {
	const rankedStreak = nextRankedStreak(facts, state.rankedStreak);
	const progress = missions.map((mission) => {
		const current = state.progress[mission.code] ?? 0;
		const applies = !mission.rule.ranked || facts.ranked;
		const value = applies
			? nextValue(mission.rule.metric, current, facts, state, rankedStreak)
			: current;
		const capped = Math.min(value, mission.rule.target);
		return {
			missionCode: mission.code,
			periodKey: periodKey(mission.period, facts.date),
			value: capped,
			completed: capped >= mission.rule.target,
		};
	});

	return {
		progress,
		state: {
			progress: Object.fromEntries(progress.map((p) => [p.missionCode, p.value])),
			lastFormat: facts.banListName,
			rankedStreak,
		},
	};
}

function nextRankedStreak(facts: MatchFacts, streak: number): number {
	if (!facts.ranked) return streak;
	return facts.won ? streak + 1 : 0;
}

function nextValue(
	metric: MissionMetric,
	current: number,
	facts: MatchFacts,
	state: RewardState,
	rankedStreak: number,
): number {
	switch (metric) {
		case "duelsPlayed":
			return current + 1;
		case "duelsWon":
			return current + (facts.won ? 1 : 0);
		case "rankedDuelsPlayed":
			return current + (facts.ranked ? 1 : 0);
		case "rankedWinStreak":
			// A completed streak stays completed; otherwise the live streak is the value.
			return Math.max(current, rankedStreak);
		case "winUnder10Turns":
			return current + (facts.won && wonAnyDuelFast(facts) ? 1 : 0);
		case "winDifferentFormat":
			return (
				current +
				(facts.won && state.lastFormat !== null && state.lastFormat !== facts.banListName ? 1 : 0)
			);
	}
}

function wonAnyDuelFast(facts: MatchFacts): boolean {
	return facts.duels.some((duel) => duel.result === "winner" && duel.turns <= FAST_WIN_MAX_TURNS);
}
