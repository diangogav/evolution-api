import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { DuelResolution, resolveDuelRecord } from "../../event-run";
import { AdventCalendar, doorOf, doorPrizeKey } from "../domain/AdventCalendar";
import { AdventDuelRepository } from "../domain/AdventDuelRepository";
import { applyDuelToDoor, DoorProgress } from "../domain/DoorProgress";
import { DoorProgressRepository } from "../domain/DoorProgressRepository";
import { PayAdventPrize } from "./PayAdventPrize";

export type ApplyDoorDuelResult = {
	progress: DoorProgress;
	/** What was applied, null when nothing was (no reservation, no record, live duel). */
	resolution: DuelResolution | null;
	/** The current reservation has a record that is not terminal yet. */
	duelLive: boolean;
};

/**
 * Applies the duel server's record of a door duel to the door that issued it, at most once
 * (advent_duels is the gate), and pays the door's prize on the win that clears it. It runs
 * on the caller's transaction, and the caller holds the door's row lock.
 */
export class ApplyDoorDuel {
	constructor(
		private readonly doors: DoorProgressRepository,
		private readonly duels: AdventDuelRepository,
		private readonly payPrize: Pick<PayAdventPrize, "run">,
	) {}

	async applyCurrent(
		progress: DoorProgress,
		calendar: AdventCalendar,
		manager: QueryableManager,
		now: Date,
	): Promise<ApplyDoorDuelResult> {
		const reservationId = progress.currentReservationId;
		const record = reservationId ? await this.duels.findRecord(reservationId, manager) : null;
		const resolution = record ? resolveDuelRecord(record, now) : null;
		if (!reservationId || !resolution) {
			return { progress, resolution: null, duelLive: record !== null };
		}

		const marked = await this.duels.markApplied(reservationId, resolution, manager);
		if (marked === "skipped") {
			// Applied by an earlier transaction that did not clear the pointer; never twice.
			const released = { ...progress, currentReservationId: null };
			await this.doors.save(released, now, manager);
			return { progress: released, resolution: null, duelLive: false };
		}

		const next = applyDuelToDoor(progress, resolution, now);
		await this.doors.save(next, now, manager);
		const door = doorOf(calendar, progress.day);
		if (door && next.clearedAt && !progress.clearedAt) {
			await this.payPrize.run(
				progress.userId,
				door.prize,
				doorPrizeKey(calendar.id, progress.day),
				manager,
			);
		}
		return { progress: next, resolution, duelLive: false };
	}
}
