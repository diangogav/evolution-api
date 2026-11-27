import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import {
	InvalidUserDeckError,
	lastChangeOf,
	MAX_LIVE_DECKS,
	StoredUserDeck,
	UserDeck,
	userDeck,
} from "../domain/UserDeck";
import { UserDeckRepository } from "../domain/UserDeckRepository";

export type SaveMyDeckInput = { userId: string; deck: UserDeck };

/**
 * Stores a deck from one of the player's devices. The copy changed last wins: an older
 * copy that arrives late answers the stored one, so the device can adopt it.
 */
export class SaveMyDeck {
	constructor(
		private readonly decks: Pick<UserDeckRepository, "find" | "saveIfNewer" | "countLive">,
	) {}

	async run({ userId, deck: input }: SaveMyDeckInput): Promise<StoredUserDeck> {
		let deck: UserDeck;
		try {
			deck = userDeck(input);
		} catch (error) {
			if (error instanceof InvalidUserDeckError) throw new InvalidArgumentError(error.message);
			throw error;
		}

		const stored = await this.decks.find(userId, deck.id);
		if (stored && lastChangeOf(stored) >= deck.updatedAt) return stored;

		// Only a deck that would become live counts against the limit; an edit never does.
		const becomesLive = !stored || stored.deletedAt !== null;
		if (becomesLive && (await this.decks.countLive(userId)) >= MAX_LIVE_DECKS) {
			throw new UnprocessableError(`An account keeps at most ${MAX_LIVE_DECKS} decks in the cloud`);
		}

		const saved = await this.decks.saveIfNewer(userId, deck);
		if (saved) return saved;
		// Another device stored a newer copy between the read and the write.
		const newer = await this.decks.find(userId, deck.id);
		if (!newer) throw new Error(`Deck ${deck.id} vanished while it was saved`);
		return newer;
	}
}
