import { StoredUserDeck, UserDeck } from "./UserDeck";

export interface UserDeckRepository {
	find(userId: string, id: string): Promise<StoredUserDeck | null>;

	/**
	 * Stores the deck when it is newer than the stored copy (its edit or its deletion), and
	 * clears a tombstone. Returns the stored deck, or null when the stored copy is newer.
	 * Atomic: two devices saving at once cannot both overwrite.
	 */
	saveIfNewer(userId: string, deck: UserDeck): Promise<StoredUserDeck | null>;

	/** Turns the deck into a tombstone unless the stored copy changed after `deletedAt`. */
	deleteIfNewer(userId: string, id: string, deletedAt: Date): Promise<void>;

	countLive(userId: string): Promise<number>;

	/** Every write of the user's decks after `revision`, tombstones included, oldest first. */
	listChangedSince(userId: string, revision: string): Promise<StoredUserDeck[]>;
}
