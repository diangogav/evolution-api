import { ConflictError } from "../../../shared/errors/ConflictError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import { TransactionRunner } from "../../rewards";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { LightningEntryView, toEntryView } from "./LightningViews";
import { lockPlayerEntry } from "./lockOpenTournament";
import { LightningEntryInput } from "./WithdrawLightningEntry";

// The client sends this when the player leaves the tournament page: pairing skips an away
// player, so nobody waits in a room for someone who is not looking.
export class PauseLightningEntry {
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
			if (entry.status !== "active") {
				throw new UnprocessableError("Your entry is no longer active");
			}
			if (entry.presence === "paired" || entry.presence === "playing") {
				throw new ConflictError("Your game is in progress");
			}
			if (entry.presence === "away") return toEntryView(entry);
			const away = { ...entry, presence: "away" as const, idleSince: null };
			await this.entries.update(away, manager);
			return toEntryView(away);
		});
	}
}
