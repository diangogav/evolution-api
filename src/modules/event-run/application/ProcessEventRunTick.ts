import { Logger } from "../../../shared/logger/domain/Logger";
import { EventDuelRepository } from "../domain/EventDuelRepository";
import { READY_RUN_IDLE_MS } from "../domain/EventRun";
import { EventRunRepository, ExpiredRun } from "../domain/EventRunRepository";
import { EventRunTickUnitOfWork } from "../domain/EventRunTickUnitOfWork";
import { ReservationStore } from "../domain/ReservationStore";
import { STALE_DUEL_MS } from "../domain/ReservedDuelRecord";
import { ApplyReservedDuel } from "./ApplyReservedDuel";

export type ProcessEventRunTickResult = {
	applied: number;
	/** Rows the server never closed, voided after 2 hours: an infrastructure alert. */
	stale: number;
	ignored: number;
	/** Reservations whose apply threw; rolled back, logged and retried on the next tick. */
	failed: number;
	expired: number;
	/** True when another instance held the worker lock and this tick did nothing. */
	skipped: boolean;
};

/**
 * Applies the records of reservations this module issued that nobody applied yet (the
 * player never came back to "/me"), voids rows the server never closed, and expires idle
 * ready runs. No cursor: retried terminal writes can commit out of `ended_at` order, so
 * the anti-join against event_run_duels decides what is pending.
 */
export class ProcessEventRunTick {
	constructor(
		private readonly unitOfWork: EventRunTickUnitOfWork,
		private readonly duels: EventDuelRepository,
		private readonly runs: EventRunRepository,
		private readonly applyDuel: Pick<ApplyReservedDuel, "applyReservation">,
		private readonly reservations: ReservationStore,
		private readonly logger: Logger,
		private readonly batchSize: number,
	) {}

	async run(now: Date): Promise<ProcessEventRunTickResult> {
		const result = await this.unitOfWork.run(async (manager) => {
			const counts = { applied: 0, stale: 0, ignored: 0, failed: 0 };
			const staleBefore = new Date(now.getTime() - STALE_DUEL_MS);
			const pending = await this.duels.listPending(staleBefore, this.batchSize, manager);
			for (const reservationId of pending) {
				try {
					const outcome = await this.unitOfWork.savepoint(manager, () =>
						this.applyDuel.applyReservation(reservationId, manager, now),
					);
					if (outcome === "applied") counts.applied++;
					else if (outcome === "stale") counts.stale++;
					else if (outcome === "ignored") counts.ignored++;
				} catch (error) {
					counts.failed++;
					this.logger.error(
						`Event run worker could not apply reservation ${reservationId}: ${errorMessage(error)}`,
					);
				}
			}
			const idleBefore = new Date(now.getTime() - READY_RUN_IDLE_MS);
			const expired = await this.runs.expireIdle(now, idleBefore, manager);
			return { counts, expired };
		});
		if (!result) {
			return { applied: 0, stale: 0, ignored: 0, failed: 0, expired: 0, skipped: true };
		}

		// After the commit: an expired run must not leave a playable reservation behind.
		await this.revokeDropped(result.expired);
		return { ...result.counts, expired: result.expired.length, skipped: false };
	}

	// Best effort: the reservation key also expires on its own TTL, and a duel claimed in the
	// last instant writes a record the next tick ignores (the run is no longer ready).
	private async revokeDropped(expired: ExpiredRun[]): Promise<void> {
		for (const { runId, reservationId } of expired) {
			if (!reservationId) continue;
			try {
				const revoked = await this.reservations.revoke(reservationId);
				if (revoked === "in_use") {
					this.logger.error(
						`Event run worker expired run ${runId} but reservation ${reservationId} was already claimed`,
					);
				}
			} catch (error) {
				this.logger.error(
					`Event run worker could not revoke reservation ${reservationId} of expired run ${runId}: ${errorMessage(error)}`,
				);
			}
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
