import { LightningEntry, LightningEntryStatus, LightningPresence } from "../domain/LightningEntry";
import {
	LightningFormat,
	LightningSystem,
	LightningTournament,
	LightningTournamentStatus,
	PrizeTable,
} from "../domain/LightningTournament";
import { swissNextRoundAt, swissRoundEndsAt } from "../domain/swissRounds";

export type LightningTournamentView = {
	id: string;
	name: string;
	format: LightningFormat;
	status: LightningTournamentStatus;
	season: number;
	registrationOpensAt: string;
	startsAt: string;
	endsAt: string;
	turnTimeSeconds: number;
	lobbyTimeoutSeconds: number;
	minPlayers: number;
	maxPlayers: number;
	pointsByPosition: PrizeTable;
	essenceByPosition: PrizeTable;
	cancelledReason: string | null;
	createdAt: string;
	system: LightningSystem;
	/** Swiss rounds, fixed at the start; null for an arena or a Swiss tournament not started. */
	rounds: number | null;
	/** The live (or last closed) Swiss round; 0 before the first one and for an arena. */
	currentRound: number;
	/** Deadline of the live Swiss round; null otherwise. */
	roundEndsAt: string | null;
	/** When the next Swiss round is paired, during a break; null otherwise. */
	nextRoundAt: string | null;
};

export type LightningEntryView = {
	userId: string;
	status: LightningEntryStatus;
	presence: LightningPresence;
	score: number;
	wins: number;
	draws: number;
	losses: number;
	gamesPlayed: number;
	noShows: number;
	registeredAt: string;
};

export function toTournamentView(tournament: LightningTournament): LightningTournamentView {
	return {
		id: tournament.id,
		name: tournament.name,
		format: tournament.format,
		status: tournament.status,
		season: tournament.season,
		registrationOpensAt: tournament.registrationOpensAt.toISOString(),
		startsAt: tournament.startsAt.toISOString(),
		endsAt: tournament.endsAt.toISOString(),
		turnTimeSeconds: tournament.turnTimeSeconds,
		lobbyTimeoutSeconds: tournament.lobbyTimeoutSeconds,
		minPlayers: tournament.minPlayers,
		maxPlayers: tournament.maxPlayers,
		pointsByPosition: {
			positions: [...tournament.pointsByPosition.positions],
			others: tournament.pointsByPosition.others,
		},
		essenceByPosition: {
			positions: [...tournament.essenceByPosition.positions],
			others: tournament.essenceByPosition.others,
		},
		cancelledReason: tournament.cancelledReason,
		createdAt: tournament.createdAt.toISOString(),
		system: tournament.system,
		rounds: tournament.system === "swiss" ? tournament.rounds : null,
		currentRound: tournament.system === "swiss" ? tournament.currentRound : 0,
		roundEndsAt: swissRoundEndsAt(tournament)?.toISOString() ?? null,
		nextRoundAt: swissNextRoundAt(tournament)?.toISOString() ?? null,
	};
}

export function toEntryView(entry: LightningEntry): LightningEntryView {
	return {
		userId: entry.userId,
		status: entry.status,
		presence: entry.presence,
		score: entry.score,
		wins: entry.wins,
		draws: entry.draws,
		losses: entry.losses,
		gamesPlayed: entry.gamesPlayed,
		noShows: entry.noShows,
		registeredAt: entry.registeredAt.toISOString(),
	};
}
