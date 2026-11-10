import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import { TransactionRunner } from "../../rewards";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { LightningEntryView, toEntryView } from "./LightningViews";
import { lockPlayerEntry } from "./lockOpenTournament";

export type LightningEntryInput = { tournamentId: string; userId: string; now: Date };

/**
 * Leaves the tournament. A game already paired or being played keeps running: its record is
 * applied when it arrives, so the opponent's result counts, and the withdrawn player is never
 * paired again.
 */
export class WithdrawLightningEntry {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly transactions: TransactionRunner,
	) {}

	async run(input: LightningEntryInput): Promise<LightningEntryView> {
		return this.transactions.run(async (manager) => {
			const { entry } = await lockPlayerEntry(
				this.tournaments,
				this.entries,
				input.tournamentId,
				input.userId,
				manager,
			);
			if (entry.status === "removed") {
				throw new UnprocessableError("You were removed from this tournament");
			}
			if (entry.status === "withdrawn") return toEntryView(entry);
			const inGame = entry.presence === "paired" || entry.presence === "playing";
			const withdrawn = {
				...entry,
				status: "withdrawn" as const,
				presence: inGame ? entry.presence : ("away" as const),
				idleSince: inGame ? entry.idleSince : null,
			};
			await this.entries.update(withdrawn, manager);
			return toEntryView(withdrawn);
		});
	}
}
