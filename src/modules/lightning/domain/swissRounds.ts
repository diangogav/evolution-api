import type { LightningTournament } from "./LightningTournament";

const MIN_COMPUTED_ROUNDS = 3;

/** Enough rounds for a single unbeaten player to emerge, and never fewer than three. */
export function swissRoundCount(players: number): number {
	return Math.max(MIN_COMPUTED_ROUNDS, Math.ceil(Math.log2(Math.max(players, 1))));
}

export function estimatedSwissEnd(input: {
	startsAt: Date;
	rounds: number;
	roundMinutes: number;
	roundBreakSeconds: number;
}): Date {
	const perRoundMs = input.roundMinutes * 60_000 + input.roundBreakSeconds * 1000;
	return new Date(input.startsAt.getTime() + input.rounds * perRoundMs);
}

// The round count is written once, at the start, so players know how long they are in.
export function startSwissTournament(
	tournament: LightningTournament,
	activePlayers: number,
): LightningTournament {
	const rounds = tournament.rounds ?? swissRoundCount(activePlayers);
	return {
		...tournament,
		rounds,
		endsAt: estimatedSwissEnd({
			startsAt: tournament.startsAt,
			rounds,
			roundMinutes: tournament.roundMinutes,
			roundBreakSeconds: tournament.roundBreakSeconds,
		}),
	};
}

type RoundClock = Pick<
	LightningTournament,
	| "system"
	| "status"
	| "rounds"
	| "currentRound"
	| "roundMinutes"
	| "roundBreakSeconds"
	| "roundStartedAt"
	| "roundClosedAt"
>;

function inRounds(tournament: RoundClock): boolean {
	return tournament.system === "swiss" && tournament.status === "running";
}

/** When time is called on the live round; null outside a live round. */
export function swissRoundEndsAt(tournament: RoundClock): Date | null {
	if (!inRounds(tournament) || tournament.currentRound === 0) return null;
	if (tournament.roundClosedAt || !tournament.roundStartedAt) return null;
	return new Date(tournament.roundStartedAt.getTime() + tournament.roundMinutes * 60_000);
}

/** When the next round is paired, during the break after a closed round; null otherwise. */
export function swissNextRoundAt(tournament: RoundClock): Date | null {
	if (!inRounds(tournament) || tournament.currentRound === 0 || !tournament.roundClosedAt) {
		return null;
	}
	if (tournament.currentRound >= (tournament.rounds ?? 0)) return null;
	return new Date(tournament.roundClosedAt.getTime() + tournament.roundBreakSeconds * 1000);
}
