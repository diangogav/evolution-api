import { t } from "elysia";

const isoTimestamp = (description: string) =>
	t.String({ description: `${description} (ISO 8601, UTC)` });

const count = (description: string) => t.Integer({ minimum: 0, description });

export const AdminEventSummarySchema = t.Object({
	id: t.String(),
	name: t.String({ description: "Spanish name, English when the event has none" }),
	startsAt: isoTimestamp("Event start, inclusive"),
	endsAt: isoTimestamp("Event end, exclusive"),
	waves: count("Number of waves in a run"),
});

export const AdminEventListSchema = t.Array(AdminEventSummarySchema, {
	description: "Every catalog event, newest start first",
});

export const EventStatsSchema = t.Object({
	event: AdminEventSummarySchema,
	totals: t.Object({
		players: count("Distinct users with at least one run"),
		runs: count("All runs"),
		completedRuns: count("Runs that cleared every wave (status won)"),
		inProgressRuns: count("Runs still playable (status ready)"),
		lostRuns: count("Runs lost"),
		expiredRuns: count("Runs left unfinished when the event ended"),
		supersededRuns: count("Runs replaced by a newer run of the same player"),
	}),
	daily: t.Array(
		t.Object({
			date: t.String({ description: "UTC day (YYYY-MM-DD)" }),
			runs: count("Runs created that day"),
			players: count("Distinct users who created a run that day"),
		}),
		{ description: "One entry per UTC day from the start up to now or the end, zero-filled" },
	),
	waveFunnel: t.Array(
		t.Object({
			wave: t.Integer({ minimum: 1 }),
			runsCleared: count("Runs that cleared at least this many waves"),
		}),
		{ description: "One entry per wave, ascending" },
	),
	decks: t.Array(
		t.Object({
			deckId: t.String(),
			deckName: t.String({ description: "Spanish name, English when the deck has none" }),
			runs: count("Runs played with the deck"),
			players: count("Distinct users who played the deck"),
			completedRuns: count("Runs with the deck that cleared every wave"),
			bestWavesCleared: count("Most waves cleared by one run with the deck"),
			avgWavesCleared: t.Number({
				minimum: 0,
				description: "Mean waves cleared per run, one decimal",
			}),
		}),
		{ description: "Every deck of the event, unplayed ones included, most runs first" },
	),
	duels: t.Object({
		wins: count("Duels the player won"),
		losses: count("Duels the player lost"),
		playerVoids: count("Duels voided because the player never started them"),
		other: count("Duels voided by the infrastructure or no longer current"),
	}),
	players: t.Array(
		t.Object({
			userId: t.String(),
			username: t.String(),
			runs: count("Runs of the player"),
			bestWavesCleared: count("Most waves cleared in one run"),
			deckIds: t.Array(t.String(), { description: "Decks the player used, sorted" }),
			inProgress: t.Boolean({ description: "Whether the player has a playable run" }),
			lastActivityAt: isoTimestamp("Latest update of any of the player's runs"),
		}),
		{ description: "Players by best wave, then by runs" },
	),
});
