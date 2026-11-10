import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import { TransactionRunner } from "../../rewards";
import { DeckLegalityChecker } from "../domain/DeckLegalityChecker";
import { LightningDeck, LightningEntry, newLightningEntry } from "../domain/LightningEntry";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { acceptsEntries } from "../domain/LightningTournament";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { LightningEntryView, toEntryView } from "./LightningViews";
import { UUID } from "./lockOpenTournament";

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
