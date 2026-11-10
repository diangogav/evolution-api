import { LightningEntry, LightningEntryStatus, LightningPresence } from "../domain/LightningEntry";
import {
	LightningFormat,
	LightningTournament,
	LightningTournamentStatus,
	PrizeTable,
} from "../domain/LightningTournament";

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
