import { LocalizedText } from "../../rewards/domain/LocalizedText";

export type EventDeck = {
	id: string;
	name: LocalizedText;
	main: number[];
	extra: number[];
	/** The WindBot that pilots this deck when it is a rival, so a run never meets its mirror. */
	botName?: string;
};

export const WAVE_TIERS = ["easy", "medium", "hard", "miniboss", "boss"] as const;

export type WaveTier = (typeof WAVE_TIERS)[number];

// One wave as stored in the catalog: its difficulty and the WindBot names its rival is
// drawn from when the wave becomes current.
export type EventWave = {
	tier: WaveTier;
	pool: string[];
};

// Cumulative prize paid the first time a player clears `wavesCleared` waves in any run.
export type PrizeTier = {
	wavesCleared: number;
	essence: number;
	cosmeticIds: string[];
};

// One gauntlet as stored in the catalog: the waves in the order the player meets them, so
// wave n is `waves[n - 1]`.
export type EventDefinition = {
	id: string;
	name: LocalizedText;
	description: LocalizedText;
	format: string;
	startsAt: Date;
	endsAt: Date;
	attemptsPerDay: number;
	waves: EventWave[];
	decks: EventDeck[];
	prizeTiers: PrizeTier[];
};

export function isEventOpen(event: EventDefinition, now: Date): boolean {
	return now.getTime() >= event.startsAt.getTime() && now.getTime() < event.endsAt.getTime();
}

export function findEventDeck(event: EventDefinition, deckId: string): EventDeck | null {
	return event.decks.find((deck) => deck.id === deckId) ?? null;
}

export function waveOf(event: EventDefinition, wave: number): EventWave | null {
	return event.waves[wave - 1] ?? null;
}
