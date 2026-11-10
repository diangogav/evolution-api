import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import { Logger } from "../../../shared/logger/domain/Logger";
import { ReservationStore } from "../../reserved-duel";
import { TransactionRunner } from "../../rewards";
import { LightningGameRepository } from "../domain/LightningGameRepository";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { LightningTournamentView, toTournamentView } from "./LightningViews";
import { isTerminal, UUID } from "./lockOpenTournament";

export type CancelLightningTournamentInput = { tournamentId: string; reason: string; now: Date };

export const MAX_CANCEL_REASON_LENGTH = 200;

/**
 * Cancels a tournament that has not ended: nothing is awarded, and every live game is voided
 * so a record arriving later is ignored. Reservations are revoked after the commit (best
 * effort; they also expire on their own), so a void that rolls back never strands a duel.
 */
export class CancelLightningTournament {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly games: LightningGameRepository,
		private readonly reservations: ReservationStore,
		private readonly transactions: TransactionRunner,
		private readonly logger: Logger,
	) {}

	async run(input: CancelLightningTournamentInput): Promise<LightningTournamentView> {
		const reason = input.reason.trim();
		if (reason.length === 0 || reason.length > MAX_CANCEL_REASON_LENGTH) {
			throw new UnprocessableError(
				`The reason must have 1 to ${MAX_CANCEL_REASON_LENGTH} characters`,
			);
		}
		const notFound = () =>
			new NotFoundError(`Lightning tournament "${input.tournamentId}" not found`);
		if (!UUID.test(input.tournamentId)) throw notFound();

		const { tournament, voided } = await this.transactions.run(async (manager) => {
			const locked = await this.tournaments.findByIdForUpdate(input.tournamentId, manager);
			if (!locked) throw notFound();
			if (isTerminal(locked)) throw new ConflictError(`The tournament is already ${locked.status}`);

			const cancelled = {
				...locked,
				status: "cancelled" as const,
				cancelledReason: reason,
				updatedAt: input.now,
			};
			await this.tournaments.update(cancelled, manager);
			const pending = await this.games.listPending(locked.id, manager);
			for (const game of pending) {
				await this.games.resolve(
					game.reservationId,
					"voided",
					"void",
					"cancelled",
					input.now,
					manager,
				);
			}
			return { tournament: cancelled, voided: pending.map((game) => game.reservationId) };
		});

		for (const reservationId of voided) {
			try {
				await this.reservations.revoke(reservationId);
			} catch (error) {
				this.logger.error(
					`Lightning could not revoke reservation ${reservationId} of cancelled tournament ${tournament.id}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		return toTournamentView(tournament);
	}
}
