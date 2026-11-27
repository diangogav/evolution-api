import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { isDeckId } from "../domain/UserDeck";
import { UserDeckRepository } from "../domain/UserDeckRepository";

export type DeleteMyDeckInput = { userId: string; id: string; deletedAt: Date };

/**
 * Deletes a deck on every device of the player. The deck stays as a tombstone so a device
 * that still has it learns about the deletion. Idempotent, and a deletion of a deck the
 * API has not seen yet is kept, so it still wins when the deck arrives later.
 */
export class DeleteMyDeck {
	constructor(private readonly decks: Pick<UserDeckRepository, "deleteIfNewer">) {}

	async run({ userId, id, deletedAt }: DeleteMyDeckInput): Promise<void> {
		if (!isDeckId(id)) throw new InvalidArgumentError("id must be a UUID");
		if (Number.isNaN(deletedAt.getTime()))
			throw new InvalidArgumentError("deletedAt must be a valid time");
		await this.decks.deleteIfNewer(userId, id, deletedAt);
	}
}
