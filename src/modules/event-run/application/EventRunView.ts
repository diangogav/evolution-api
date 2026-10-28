import { EventDefinition } from "../domain/EventDefinition";
import { EventRun, EventRunStatus } from "../domain/EventRun";

export type EventRunView = {
	id: string;
	eventId: string;
	deckId: string;
	status: EventRunStatus;
	currentWave: number;
	totalWaves: number;
	wavesCleared: number;
	/** The rival drawn for the wave to play next; null once the run ended. */
	botName: string | null;
	/** Rivals of the waves already cleared, in order. */
	facedBots: string[];
	/** The rival of the wave where the run was lost; null unless the run is lost. */
	lostTo: string | null;
	voids: number;
	duelLive: boolean;
};

export function toEventRunView(
	run: EventRun,
	event: EventDefinition,
	duelLive = false,
): EventRunView {
	return {
		id: run.id,
		eventId: run.eventId,
		deckId: run.deckId,
		status: run.status,
		currentWave: run.currentWave,
		totalWaves: event.waves.length,
		wavesCleared: run.wavesCleared,
		botName: run.status === "ready" ? run.currentBot : null,
		facedBots: [...run.facedBots],
		// A lost run keeps the rival of the wave it fell on (a loss never clears it).
		lostTo: run.status === "lost" ? run.currentBot : null,
		voids: run.voids,
		duelLive,
	};
}
