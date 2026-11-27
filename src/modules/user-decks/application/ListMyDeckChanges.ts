import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { StoredUserDeck } from "../domain/UserDeck";
import { UserDeckRepository } from "../domain/UserDeckRepository";

export type ListMyDeckChangesInput = { userId: string; since: string };

export type MyDeckChanges = {
	decks: StoredUserDeck[];
	/** Pass it as `since` next time to get only what changed after this answer. */
	cursor: string;
};

/** What changed in the player's cloud decks since a cursor, deletions included. */
export class ListMyDeckChanges {
	constructor(private readonly decks: Pick<UserDeckRepository, "listChangedSince">) {}

	async run({ userId, since }: ListMyDeckChangesInput): Promise<MyDeckChanges> {
		if (!/^\d{1,19}$/.test(since)) throw new InvalidArgumentError("since must be a cursor");

		const decks = await this.decks.listChangedSince(userId, since);
		const cursor = decks.reduce(
			(highest, deck) => (BigInt(deck.revision) > BigInt(highest) ? deck.revision : highest),
			since,
		);
		return { decks, cursor };
	}
}
