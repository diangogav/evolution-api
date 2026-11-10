import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import { TransactionRunner } from "../../rewards";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { LightningEntryView, toEntryView } from "./LightningViews";
import { lockPlayerEntry } from "./lockOpenTournament";
import { LightningEntryInput } from "./WithdrawLightningEntry";

// "I'm back": an away player (paused, or parked after a no-show) rejoins the idle queue and
// waits from now, behind players who were already waiting.
export class ResumeLightningEntry {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly transactions: TransactionRunner,
	) {}

	async run(input: LightningEntryInput): Promise<LightningEntryView> {
		return this.transactions.run(async (manager) => {
			const { tournament, entry } = await lockPlayerEntry(
				this.tournaments,
				this.entries,
				input.tournamentId,
				input.userId,
				manager,
			);
			if (entry.status !== "active") {
				throw new UnprocessableError("Your entry is no longer active");
			}
			if (entry.presence !== "away") return toEntryView(entry);
			const idle = {
				...entry,
				presence: "idle" as const,
				idleSince: tournament.status === "running" ? input.now : null,
			};
			await this.entries.update(idle, manager);
			return toEntryView(idle);
		});
	}
}
