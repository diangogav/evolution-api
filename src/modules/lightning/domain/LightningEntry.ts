import { RequiredDeck } from "../../reserved-duel";

export const LIGHTNING_ENTRY_STATUSES = ["active", "withdrawn", "removed"] as const;
export type LightningEntryStatus = (typeof LIGHTNING_ENTRY_STATUSES)[number];

export const LIGHTNING_PRESENCES = ["idle", "paired", "playing", "away"] as const;
export type LightningPresence = (typeof LIGHTNING_PRESENCES)[number];

export type LightningDeck = RequiredDeck;

export type LightningEntry = {
	tournamentId: string;
	userId: string;
	registeredAt: Date;
	status: LightningEntryStatus;
	presence: LightningPresence;
	/** The lists the server requires at every duel of this tournament. */
	deck: LightningDeck;
	score: number;
	wins: number;
	draws: number;
	losses: number;
	gamesPlayed: number;
	noShows: number;
	lastOpponentId: string | null;
	/** Since when the player waits for a pairing; null until the arena runs. */
	idleSince: Date | null;
};

export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;
// The third missed room removes the entry: an absent player blocks an opponent each time.
export const MAX_NO_SHOWS = 3;

export function newLightningEntry(input: {
	tournamentId: string;
	userId: string;
	deck: LightningDeck;
	now: Date;
	/** True when the arena already runs, so the late entry waits from now. */
	running: boolean;
}): LightningEntry {
	return {
		tournamentId: input.tournamentId,
		userId: input.userId,
		registeredAt: input.now,
		status: "active",
		presence: "idle",
		deck: { main: [...input.deck.main], extra: [...input.deck.extra], side: [...input.deck.side] },
		score: 0,
		wins: 0,
		draws: 0,
		losses: 0,
		gamesPlayed: 0,
		noShows: 0,
		lastOpponentId: null,
		idleSince: input.running ? input.now : null,
	};
}

// Live standings show everyone still in (and anyone who left after playing); the final
// table keeps only players with at least one game, so registering alone earns nothing.
export function qualifiesForStandings(
	entry: Pick<LightningEntry, "status" | "gamesPlayed">,
	options: { final: boolean },
): boolean {
	if (entry.status === "removed") return false;
	if (entry.status === "withdrawn" || options.final) return entry.gamesPlayed > 0;
	return true;
}

/** What one seat records from a resolved game. `void` counts nothing. */
export type EntryGameOutcome = "win" | "draw" | "loss" | "no_show" | "void";

// A played or voided game frees the player for the next pairing; a no-show parks them
// away until they come back, so an absent player never blocks another opponent.
export function recordGameOutcome(
	entry: LightningEntry,
	outcome: EntryGameOutcome,
	now: Date,
): LightningEntry {
	const freed: LightningEntry = { ...entry, presence: "idle", idleSince: now };
	switch (outcome) {
		case "win":
			return {
				...freed,
				score: entry.score + WIN_POINTS,
				wins: entry.wins + 1,
				gamesPlayed: entry.gamesPlayed + 1,
			};
		case "draw":
			return {
				...freed,
				score: entry.score + DRAW_POINTS,
				draws: entry.draws + 1,
				gamesPlayed: entry.gamesPlayed + 1,
			};
		case "loss":
			return { ...freed, losses: entry.losses + 1, gamesPlayed: entry.gamesPlayed + 1 };
		case "void":
			return freed;
		case "no_show": {
			const noShows = entry.noShows + 1;
			const removed = noShows >= MAX_NO_SHOWS && entry.status === "active";
			return {
				...entry,
				presence: "away",
				idleSince: null,
				noShows,
				status: removed ? "removed" : entry.status,
			};
		}
	}
}
