import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { TransactionRunner } from "../../rewards/domain/TransactionRunner";
import { EventCatalogRepository } from "../domain/EventCatalogRepository";
import { isRunIdle } from "../domain/EventRun";
import { EventRunRepository } from "../domain/EventRunRepository";
import { ReservationStore } from "../domain/ReservationStore";
import { ApplyReservedDuel } from "./ApplyReservedDuel";
import { EventRunView, toEventRunView } from "./EventRunView";
import { releaseReservation } from "./releaseReservation";

export type GetMyEventRunInput = { userId: string; eventId: string; now: Date };
export type GetMyEventRunResult = { run: EventRunView | null };

// The player's current or last run. Applies its pending duel record on the spot, so the
// client sees the result right after the duel without waiting for the worker.
export class GetMyEventRun {
	constructor(
		private readonly catalog: EventCatalogRepository,
		private readonly runs: EventRunRepository,
		private readonly reservations: ReservationStore,
		private readonly applyDuel: Pick<ApplyReservedDuel, "applyCurrent">,
		private readonly transactions: TransactionRunner,
	) {}

	async run(input: GetMyEventRunInput): Promise<GetMyEventRunResult> {
		const event = await this.catalog.findById(input.eventId);
		if (!event) throw new NotFoundError(`Event "${input.eventId}" not found`);

		return this.transactions.run(async (manager) => {
			const latest = await this.runs.findLatestForUpdate(input.userId, event.id, manager);
			if (!latest) return { run: null };

			const { run, duelLive } = await this.applyDuel.applyCurrent(
				latest,
				event,
				manager,
				input.now,
			);
			if (!duelLive && isRunIdle(run, event, input.now)) {
				const revoked = await this.tryRelease(run);
				if (revoked) {
					const expired = {
						...run,
						status: "expired" as const,
						currentReservationId: null,
						updatedAt: input.now,
					};
					await this.runs.update(expired, manager);
					return { run: toEventRunView(expired, event) };
				}
			}
			return { run: toEventRunView(run, event, duelLive) };
		});
	}

	// A reservation claimed in the last instant keeps the run alive instead of failing a read.
	private async tryRelease(run: Parameters<typeof releaseReservation>[0]): Promise<boolean> {
		try {
			await releaseReservation(run, false, this.reservations);
			return true;
		} catch {
			return false;
		}
	}
}
