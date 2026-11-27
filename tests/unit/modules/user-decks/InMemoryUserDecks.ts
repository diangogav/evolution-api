import {
	lastChangeOf,
	type StoredUserDeck,
	type UserDeck,
} from "../../../../src/modules/user-decks/domain/UserDeck";
import type { UserDeckRepository } from "../../../../src/modules/user-decks/domain/UserDeckRepository";

/** The user_decks table held in memory, with the same rules as the SQL statements. */
export class InMemoryUserDecks implements UserDeckRepository {
	readonly rows = new Map<string, StoredUserDeck & { userId: string }>();
	private revision = 0n;

	private key(userId: string, id: string) {
		return `${userId}/${id}`;
	}

	private next() {
		this.revision += 1n;
		return String(this.revision);
	}

	private strip({ userId: _userId, ...deck }: StoredUserDeck & { userId: string }): StoredUserDeck {
		return { ...deck, main: [...deck.main], extra: [...deck.extra], side: [...deck.side] };
	}

	async find(userId: string, id: string) {
		const row = this.rows.get(this.key(userId, id));
		return row ? this.strip(row) : null;
	}

	async saveIfNewer(userId: string, deck: UserDeck) {
		const stored = this.rows.get(this.key(userId, deck.id));
		if (stored && lastChangeOf(stored) >= deck.updatedAt) return null;
		const row = {
			...deck,
			createdAt: stored?.createdAt ?? deck.createdAt,
			userId,
			deletedAt: null,
			revision: this.next(),
		};
		this.rows.set(this.key(userId, deck.id), row);
		return this.strip(row);
	}

	async deleteIfNewer(userId: string, id: string, deletedAt: Date) {
		const stored = this.rows.get(this.key(userId, id));
		if (stored && lastChangeOf(stored) >= deletedAt) return;
		this.rows.set(this.key(userId, id), {
			id,
			userId,
			name: "",
			format: null,
			main: [],
			extra: [],
			side: [],
			createdAt: stored?.createdAt ?? deletedAt,
			updatedAt: stored?.updatedAt ?? deletedAt,
			deletedAt,
			revision: this.next(),
		});
	}

	async countLive(userId: string) {
		return [...this.rows.values()].filter((row) => row.userId === userId && !row.deletedAt).length;
	}

	async listChangedSince(userId: string, revision: string) {
		return [...this.rows.values()]
			.filter((row) => row.userId === userId && BigInt(row.revision) > BigInt(revision))
			.sort((a, b) => (BigInt(a.revision) < BigInt(b.revision) ? -1 : 1))
			.map((row) => this.strip(row));
	}
}
