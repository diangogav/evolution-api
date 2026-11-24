import { ForbiddenError } from "../../../shared/errors/ForbiddenError";
import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import { TransactionRunner } from "../../rewards";
import { EmailVerifications, isVerifiedAccount } from "../../user";
import { DeckLegalityChecker } from "../domain/DeckLegalityChecker";
import { LightningDeck, LightningEntry, newLightningEntry } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { acceptsEntries } from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { LightningEntryView, toEntryView } from "./LightningViews";
import { UUID } from "./lockOpenTournament";

/** Whether entry requires a verified account, and the creation date that exempts older accounts. */
export type VerifiedAccountPolicy = { required: boolean; cutoff: Date | null };

export type EnterLightningTournamentInput = {
	tournamentId: string;
	userId: string;
	deck: LightningDeck;
	now: Date;
};

/**
 * Registers the player with the lists the server will require at every duel. The deck is
 * checked against the format's list before any lock is taken (it reads remote lists);
 * capacity and the one-entry rule are checked under the tournament row lock, so two
 * concurrent entries cannot both take the last seat.
 */
export class EnterLightningTournament {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly legality: DeckLegalityChecker,
		private readonly transactions: TransactionRunner,
		private readonly accounts: Pick<EmailVerifications, "verificationFacts">,
		private readonly verifiedAccount: VerifiedAccountPolicy,
	) {}

	async run(input: EnterLightningTournamentInput): Promise<LightningEntryView> {
		const notFound = () =>
			new NotFoundError(`Lightning tournament "${input.tournamentId}" not found`);
		if (!UUID.test(input.tournamentId)) throw notFound();
		const tournament = await this.tournaments.findById(input.tournamentId);
		if (!tournament) throw notFound();
		if (!acceptsEntries(tournament.status, tournament.system)) {
			throw new UnprocessableError("Registration is not open for this tournament");
		}
		await this.requireVerifiedAccount(input.userId);
		const validation = await this.legality.check(tournament.format, input.deck);
		if (!validation.legal) throw new UnprocessableError(`Illegal deck: ${validation.reason}`);

		return this.transactions.run(async (manager) => {
			const locked = await this.tournaments.findByIdForUpdate(input.tournamentId, manager);
			if (!locked) throw notFound();
			if (!acceptsEntries(locked.status, locked.system)) {
				throw new UnprocessableError("Registration is not open for this tournament");
			}
			const running = locked.status === "running";
			const existing = await this.entries.findOne(locked.id, input.userId, manager);
			if (existing?.status === "active") {
				throw new ConflictError("You are already entered in this tournament");
			}
			if (existing?.status === "removed") {
				throw new UnprocessableError("You were removed from this tournament");
			}

			const all = await this.entries.listByTournament(locked.id, manager);
			const active = all.filter((entry) => entry.status === "active").length;
			if (active >= locked.maxPlayers) throw new UnprocessableError("The tournament is full");

			if (existing) {
				const rejoined = rejoin(existing, input.deck, running, input.now);
				await this.entries.update(rejoined, manager);
				return toEntryView(rejoined);
			}
			const entry = newLightningEntry({
				tournamentId: locked.id,
				userId: input.userId,
				deck: input.deck,
				now: input.now,
				running,
			});
			await this.entries.insert(entry, manager);
			return toEntryView(entry);
		});
	}

	// An account nobody can trace back to its owner could farm tournament rewards with
	// throwaway sign-ups. An unknown user counts as unverified.
	private async requireVerifiedAccount(userId: string): Promise<void> {
		if (!this.verifiedAccount.required) return;
		const facts = await this.accounts.verificationFacts(userId);
		if (facts && isVerifiedAccount(facts, this.verifiedAccount.cutoff)) return;
		throw new ForbiddenError("Verify your email to join tournaments");
	}
}

// A withdrawn player may come back with a new deck and keeps what they scored. A game of
// theirs still live keeps its presence: its record frees them when it arrives.
function rejoin(
	entry: LightningEntry,
	deck: LightningDeck,
	running: boolean,
	now: Date,
): LightningEntry {
	const inGame = entry.presence === "paired" || entry.presence === "playing";
	return {
		...entry,
		status: "active",
		deck: { main: [...deck.main], extra: [...deck.extra], side: [...deck.side] },
		presence: inGame ? entry.presence : "idle",
		idleSince: inGame ? null : running ? now : null,
	};
}
