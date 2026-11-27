/** A deck as the player's devices sync it. Times are the client's, in UTC. */
export type UserDeck = {
	id: string;
	name: string;
	format: string | null;
	main: number[];
	extra: number[];
	side: number[];
	createdAt: Date;
	updatedAt: Date;
};

/** A deck as stored: `deletedAt` marks a tombstone, `revision` orders every write. */
export type StoredUserDeck = UserDeck & {
	deletedAt: Date | null;
	/** Decimal string of a bigint sequence value; compare with BigInt. */
	revision: string;
};

/** Live decks one account can keep in the cloud. Tombstones do not count. */
export const MAX_LIVE_DECKS = 300;

// Storage bounds, not format rules: the client applies the rules of each format, and a
// deck that does not fit its format yet is still worth keeping.
export const DECK_BOUNDS = { name: 64, format: 32, main: 80, extra: 30, side: 30 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CARD_CODE = 2_147_483_647;

export class InvalidUserDeckError extends Error {
	constructor(reason: string) {
		super(`Invalid deck: ${reason}`);
		this.name = "InvalidUserDeckError";
	}
}

export function isDeckId(id: string): boolean {
	return UUID.test(id);
}

export function userDeck(input: UserDeck): UserDeck {
	if (!isDeckId(input.id)) throw new InvalidUserDeckError("id must be a UUID");
	const name = input.name.trim();
	if (name.length === 0) throw new InvalidUserDeckError("name must not be empty");
	if (name.length > DECK_BOUNDS.name) {
		throw new InvalidUserDeckError(`name must have at most ${DECK_BOUNDS.name} characters`);
	}
	if (
		input.format !== null &&
		(input.format.length === 0 || input.format.length > DECK_BOUNDS.format)
	) {
		throw new InvalidUserDeckError(`format must have 1 to ${DECK_BOUNDS.format} characters`);
	}
	for (const zone of ["main", "extra", "side"] as const) {
		const cards = input[zone];
		if (cards.length > DECK_BOUNDS[zone]) {
			throw new InvalidUserDeckError(`${zone} must have at most ${DECK_BOUNDS[zone]} cards`);
		}
		if (!cards.every((code) => Number.isInteger(code) && code > 0 && code <= MAX_CARD_CODE)) {
			throw new InvalidUserDeckError(`${zone} must hold positive card codes`);
		}
	}
	if (Number.isNaN(input.createdAt.getTime()) || Number.isNaN(input.updatedAt.getTime())) {
		throw new InvalidUserDeckError("createdAt and updatedAt must be valid times");
	}

	return { ...input, name, main: [...input.main], extra: [...input.extra], side: [...input.side] };
}

/** The time a stored deck last changed: its last edit, or its deletion if later. */
export function lastChangeOf(deck: Pick<StoredUserDeck, "updatedAt" | "deletedAt">): Date {
	return deck.deletedAt && deck.deletedAt > deck.updatedAt ? deck.deletedAt : deck.updatedAt;
}
