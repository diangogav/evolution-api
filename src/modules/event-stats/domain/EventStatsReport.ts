import type { EventDefinition } from "../../event-run/domain/EventDefinition";
import type { EventRunStatus } from "../../event-run/domain/EventRun";
import { localize } from "../../rewards/domain/LocalizedText";

// The back office is Spanish; `localize` falls back to English for rows without it.
const ADMIN_LOCALE = "es";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EventSummary {
	id: string;
	name: string;
	startsAt: string;
	endsAt: string;
	waves: number;
}

/** Grouped counts for one event's runs; groups without runs are simply missing. */
export interface EventRawStats {
	readonly statusCounts: readonly { status: string; runs: number }[];
	readonly totalPlayers: number;
	/** `date` is the UTC day (YYYY-MM-DD) the runs were created on. */
	readonly daily: readonly { date: string; runs: number; players: number }[];
	readonly wavesCleared: readonly { wavesCleared: number; runs: number }[];
	readonly decks: readonly {
		deckId: string;
		runs: number;
		players: number;
		completedRuns: number;
		bestWavesCleared: number;
		totalWavesCleared: number;
	}[];
	readonly duelOutcomes: readonly { outcome: string; duels: number }[];
	readonly players: readonly {
		userId: string;
		username: string;
		runs: number;
		bestWavesCleared: number;
		deckIds: string[];
		inProgress: boolean;
		lastActivityAt: Date;
	}[];
}

export interface EventStatsRepository {
	loadRawStats(eventId: string): Promise<EventRawStats>;
}

export interface EventStatsReport {
	event: EventSummary;
	totals: {
		players: number;
		runs: number;
		completedRuns: number;
		inProgressRuns: number;
		lostRuns: number;
		expiredRuns: number;
		supersededRuns: number;
	};
	daily: { date: string; runs: number; players: number }[];
	waveFunnel: { wave: number; runsCleared: number }[];
	decks: {
		deckId: string;
		deckName: string;
		runs: number;
		players: number;
		completedRuns: number;
		bestWavesCleared: number;
		avgWavesCleared: number;
	}[];
	duels: { wins: number; losses: number; playerVoids: number; other: number };
	players: {
		userId: string;
		username: string;
		runs: number;
		bestWavesCleared: number;
		deckIds: string[];
		inProgress: boolean;
		lastActivityAt: string;
	}[];
}

export function summarizeEvent(event: EventDefinition): EventSummary {
	return {
		id: event.id,
		name: localize(event.name, ADMIN_LOCALE),
		startsAt: event.startsAt.toISOString(),
		endsAt: event.endsAt.toISOString(),
		waves: event.waves.length,
	};
}

export function summarizeEvents(events: readonly EventDefinition[]): EventSummary[] {
	return [...events]
		.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
		.map(summarizeEvent);
}

/** UTC days from the start's day up to `min(now, endsAt)`, exclusive. */
export function eventDays(startsAt: Date, endsAt: Date, now: Date): string[] {
	const end = Math.min(now.getTime(), endsAt.getTime());
	const days: string[] = [];
	for (let day = Math.floor(startsAt.getTime() / DAY_MS) * DAY_MS; day < end; day += DAY_MS) {
		days.push(new Date(day).toISOString().slice(0, 10));
	}
	return days;
}

export function buildEventStatsReport(
	event: EventDefinition,
	raw: EventRawStats,
	now: Date,
): EventStatsReport {
	const byStatus = (status: EventRunStatus) =>
		raw.statusCounts.find((row) => row.status === status)?.runs ?? 0;

	const daily = new Map(raw.daily.map((row) => [row.date, row]));

	const decks = new Map(raw.decks.map((row) => [row.deckId, row]));

	const duel = (outcome: string) =>
		raw.duelOutcomes.find((row) => row.outcome === outcome)?.duels ?? 0;
	const allDuels = raw.duelOutcomes.reduce((sum, row) => sum + row.duels, 0);
	const wins = duel("win");
	const losses = duel("loss");
	const playerVoids = duel("player_void");

	return {
		event: summarizeEvent(event),
		totals: {
			players: raw.totalPlayers,
			runs: raw.statusCounts.reduce((sum, row) => sum + row.runs, 0),
			completedRuns: byStatus("won"),
			inProgressRuns: byStatus("ready"),
			lostRuns: byStatus("lost"),
			expiredRuns: byStatus("expired"),
			supersededRuns: byStatus("superseded"),
		},
		daily: eventDays(event.startsAt, event.endsAt, now).map((date) => ({
			date,
			runs: daily.get(date)?.runs ?? 0,
			players: daily.get(date)?.players ?? 0,
		})),
		waveFunnel: event.waves.map((_, index) => ({
			wave: index + 1,
			runsCleared: raw.wavesCleared
				.filter((row) => row.wavesCleared >= index + 1)
				.reduce((sum, row) => sum + row.runs, 0),
		})),
		// Stable sort keeps the catalog order among decks with the same run count.
		decks: event.decks
			.map((deck) => {
				const row = decks.get(deck.id);
				const runs = row?.runs ?? 0;
				return {
					deckId: deck.id,
					deckName: localize(deck.name, ADMIN_LOCALE),
					runs,
					players: row?.players ?? 0,
					completedRuns: row?.completedRuns ?? 0,
					bestWavesCleared: row?.bestWavesCleared ?? 0,
					avgWavesCleared: runs === 0 ? 0 : roundToTenth((row?.totalWavesCleared ?? 0) / runs),
				};
			})
			.sort((a, b) => b.runs - a.runs),
		duels: { wins, losses, playerVoids, other: allDuels - wins - losses - playerVoids },
		players: [...raw.players]
			.sort(
				(a, b) =>
					b.bestWavesCleared - a.bestWavesCleared ||
					b.runs - a.runs ||
					a.username.localeCompare(b.username),
			)
			.map((player) => ({ ...player, lastActivityAt: player.lastActivityAt.toISOString() })),
	};
}

function roundToTenth(value: number): number {
	return Math.round(value * 10) / 10;
}
