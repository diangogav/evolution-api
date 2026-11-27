import { beforeEach, describe, expect, it } from "bun:test";

import { DeleteMyDeck } from "../../../../../src/modules/user-decks/application/DeleteMyDeck";
import { ListMyDeckChanges } from "../../../../../src/modules/user-decks/application/ListMyDeckChanges";
import { SaveMyDeck } from "../../../../../src/modules/user-decks/application/SaveMyDeck";
import { MAX_LIVE_DECKS } from "../../../../../src/modules/user-decks/domain/UserDeck";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";
import { InMemoryUserDecks } from "../InMemoryUserDecks";
import { at, DECK_ID, deckMother, newDeckId } from "../deckMother";

describe("user decks", () => {
	let decks: InMemoryUserDecks;
	let save: SaveMyDeck;
	let remove: DeleteMyDeck;
	let list: ListMyDeckChanges;

	beforeEach(() => {
		decks = new InMemoryUserDecks();
		save = new SaveMyDeck(decks);
		remove = new DeleteMyDeck(decks);
		list = new ListMyDeckChanges(decks);
	});

	describe("SaveMyDeck", () => {
		it("stores a new deck with a revision", async () => {
			const stored = await save.run({ userId: "user-1", deck: deckMother() });

			expect(stored).toMatchObject({ id: DECK_ID, name: "Blue-Eyes", deletedAt: null });
			expect(stored.revision).toBe("1");
		});

		it("replaces an older copy and keeps the first creation time", async () => {
			await save.run({ userId: "user-1", deck: deckMother() });

			const stored = await save.run({
				userId: "user-1",
				deck: deckMother({ name: "Dark Magician", createdAt: at(5), updatedAt: at(5) }),
			});

			expect(stored).toMatchObject({ name: "Dark Magician", createdAt: at(0), updatedAt: at(5) });
		});

		it("keeps a newer stored copy and answers it", async () => {
			await save.run({ userId: "user-1", deck: deckMother({ name: "Newer", updatedAt: at(10) }) });

			const stored = await save.run({
				userId: "user-1",
				deck: deckMother({ name: "Older", updatedAt: at(5) }),
			});

			expect(stored.name).toBe("Newer");
			expect(stored.revision).toBe("1");
		});

		it("keeps a deletion that is newer than the copy", async () => {
			await remove.run({ userId: "user-1", id: DECK_ID, deletedAt: at(10) });

			const stored = await save.run({ userId: "user-1", deck: deckMother({ updatedAt: at(5) }) });

			expect(stored.deletedAt).toEqual(at(10));
		});

		it("brings a deleted deck back with an edit made after the deletion", async () => {
			await remove.run({ userId: "user-1", id: DECK_ID, deletedAt: at(5) });

			const stored = await save.run({ userId: "user-1", deck: deckMother({ updatedAt: at(10) }) });

			expect(stored).toMatchObject({ name: "Blue-Eyes", deletedAt: null });
		});

		it("refuses a new deck past the limit but accepts an edit at the limit", async () => {
			for (let index = 0; index < MAX_LIVE_DECKS; index++) {
				await save.run({ userId: "user-1", deck: deckMother({ id: newDeckId() }) });
			}

			await expect(
				save.run({ userId: "user-1", deck: deckMother({ id: newDeckId() }) }),
			).rejects.toThrow(UnprocessableError);
			const [first] = await list.run({ userId: "user-1", since: "0" }).then((r) => r.decks);
			await expect(
				save.run({ userId: "user-1", deck: { ...first, name: "Edited", updatedAt: at(1) } }),
			).resolves.toMatchObject({ name: "Edited" });
		});

		it("answers 400 for an invalid deck", async () => {
			await expect(save.run({ userId: "user-1", deck: deckMother({ name: "" }) })).rejects.toThrow(
				InvalidArgumentError,
			);
		});

		it("keeps the decks of each user apart", async () => {
			await save.run({ userId: "user-1", deck: deckMother({ name: "Mine" }) });
			await save.run({ userId: "user-2", deck: deckMother({ name: "Theirs" }) });

			expect((await decks.find("user-1", DECK_ID))?.name).toBe("Mine");
		});
	});

	describe("DeleteMyDeck", () => {
		it("turns the deck into a tombstone without its contents", async () => {
			await save.run({ userId: "user-1", deck: deckMother() });

			await remove.run({ userId: "user-1", id: DECK_ID, deletedAt: at(5) });

			expect(await decks.find("user-1", DECK_ID)).toMatchObject({
				name: "",
				main: [],
				deletedAt: at(5),
			});
		});

		it("is idempotent", async () => {
			await save.run({ userId: "user-1", deck: deckMother() });
			await remove.run({ userId: "user-1", id: DECK_ID, deletedAt: at(5) });

			await remove.run({ userId: "user-1", id: DECK_ID, deletedAt: at(5) });

			expect((await list.run({ userId: "user-1", since: "0" })).decks).toHaveLength(1);
		});

		it("keeps a copy edited after the deletion time", async () => {
			await save.run({ userId: "user-1", deck: deckMother({ updatedAt: at(10) }) });

			await remove.run({ userId: "user-1", id: DECK_ID, deletedAt: at(5) });

			expect((await decks.find("user-1", DECK_ID))?.deletedAt).toBeNull();
		});

		it("records the deletion of a deck it has not seen, so the deck loses when it arrives", async () => {
			await remove.run({ userId: "user-1", id: DECK_ID, deletedAt: at(10) });

			await save.run({ userId: "user-1", deck: deckMother({ updatedAt: at(5) }) });

			expect((await decks.find("user-1", DECK_ID))?.deletedAt).toEqual(at(10));
		});

		it("answers 400 for an id that is not a UUID", async () => {
			await expect(
				remove.run({ userId: "user-1", id: "deck-1", deletedAt: at(1) }),
			).rejects.toThrow(InvalidArgumentError);
		});
	});

	describe("ListMyDeckChanges", () => {
		it("answers every change with the highest revision as the cursor", async () => {
			const other = newDeckId();
			await save.run({ userId: "user-1", deck: deckMother() });
			await save.run({ userId: "user-1", deck: deckMother({ id: other }) });
			await remove.run({ userId: "user-1", id: DECK_ID, deletedAt: at(5) });

			const changes = await list.run({ userId: "user-1", since: "0" });

			expect(changes.decks.map((deck) => [deck.id, deck.deletedAt !== null])).toEqual([
				[other, false],
				[DECK_ID, true],
			]);
			expect(changes.cursor).toBe("3");
		});

		it("answers only what changed after the cursor", async () => {
			await save.run({ userId: "user-1", deck: deckMother() });
			const { cursor } = await list.run({ userId: "user-1", since: "0" });
			await save.run({ userId: "user-1", deck: deckMother({ name: "Edited", updatedAt: at(1) }) });

			const changes = await list.run({ userId: "user-1", since: cursor });

			expect(changes.decks.map((deck) => deck.name)).toEqual(["Edited"]);
		});

		it("answers only the caller's decks and keeps the cursor when nothing changed", async () => {
			await save.run({ userId: "user-2", deck: deckMother() });

			expect(await list.run({ userId: "user-1", since: "7" })).toEqual({ decks: [], cursor: "7" });
		});

		it("answers 400 for a cursor that is not a number", async () => {
			await expect(list.run({ userId: "user-1", since: "abc" })).rejects.toThrow(
				InvalidArgumentError,
			);
		});
	});
});
