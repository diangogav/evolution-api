import { LightningTournamentStatus } from "./LightningTournament";

export type ClockTransitionInput = {
	status: LightningTournamentStatus;
	registrationOpensAt: Date;
	startsAt: Date;
	endsAt: Date;
	minPlayers: number;
	activeEntries: number;
	liveGames: number;
	now: Date;
};

// The whole state machine runs on the clock, so a tick that arrives late (worker down)
// catches up through every transition it missed instead of waiting one tick per step.
export function nextStatusByClock(input: ClockTransitionInput): LightningTournamentStatus {
	let status = input.status;
	for (;;) {
		const next = step(status, input);
		if (next === status) return status;
		status = next;
	}
}

function step(
	status: LightningTournamentStatus,
	input: ClockTransitionInput,
): LightningTournamentStatus {
	const now = input.now.getTime();
	switch (status) {
		case "scheduled":
			return now >= input.registrationOpensAt.getTime() ? "registration" : status;
		case "registration":
			if (now < input.startsAt.getTime()) return status;
			return input.activeEntries >= input.minPlayers ? "running" : "cancelled";
		case "running":
			return now >= input.endsAt.getTime() ? "finishing" : status;
		case "finishing":
			return input.liveGames === 0 ? "completed" : status;
		case "completed":
		case "cancelled":
			return status;
	}
}
