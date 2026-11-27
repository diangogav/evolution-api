import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { DeleteMyDeck } from "../../../../src/modules/user-decks/application/DeleteMyDeck";
import { ListMyDeckChanges } from "../../../../src/modules/user-decks/application/ListMyDeckChanges";
import { SaveMyDeck } from "../../../../src/modules/user-decks/application/SaveMyDeck";
import { MAX_LIVE_DECKS } from "../../../../src/modules/user-decks/domain/UserDeck";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import { createMeDecksRouter } from "../../../../src/server/routes/me-decks-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { InMemoryUserDecks } from "../../modules/user-decks/InMemoryUserDecks";
import { DECK_ID, deckMother, newDeckId } from "../../modules/user-decks/deckMother";

const BODY = {
	name: "Blue-Eyes",
	format: "tcg",
	main: [89631139],
	extra: [],
	side: [],
	createdAt: "2026-11-27T12:00:00.000Z",
	updatedAt: "2026-11-27T12:00:00.000Z",
};

function buildApp() {
	const decks = new InMemoryUserDecks();
	const router = createMeDecksRouter({
		// The bearer token is the user id, so a test signs in by naming the user.
		requireUser: createRequireUser({
			jwt: { decode: (token) => ({ id: token }) },
			activeBans: { execute: async () => null },
			revokedSessions: { isRevoked: async () => false },
		}),
		list: new ListMyDeckChanges(decks),
		save: new SaveMyDeck(decks),
		remove: new DeleteMyDeck(decks),
	});
	const app = new Elysia().onError(mapDomainErrorStatus).use(router);
	const call = (method: string, path: string, token?: string, body?: unknown) =>
		app.handle(
			new Request(`http://localhost/me/decks${path}`, {
				method,
				headers: {
					...(token ? { authorization: `Bearer ${token}` } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				body: body ? JSON.stringify(body) : undefined,
			}),
		);
	return { call, decks };
}

describe("me decks router", () => {
	it("saves a deck and lists it with the next cursor", async () => {
		const { call } = buildApp();

		const saved = await call("PUT", `/${DECK_ID}`, "user-1", BODY);
		const listed = await call("GET", "", "user-1");

		expect(saved.status).toBe(200);
		expect(await saved.json()).toMatchObject({
			id: DECK_ID,
			name: "Blue-Eyes",
			deletedAt: null,
			revision: "1",
		});
		expect(await listed.json()).toMatchObject({ decks: [{ id: DECK_ID }], cursor: "1" });
	});

	it("lists only the changes after `since`", async () => {
		const { call } = buildApp();
		await call("PUT", `/${DECK_ID}`, "user-1", BODY);

		const listed = await call("GET", "?since=1", "user-1");

		expect(await listed.json()).toEqual({ decks: [], cursor: "1" });
	});

	it("deletes a deck and lists the deletion", async () => {
		const { call } = buildApp();
		await call("PUT", `/${DECK_ID}`, "user-1", BODY);

		const deleted = await call("DELETE", `/${DECK_ID}`, "user-1", {
			deletedAt: "2026-11-27T13:00:00.000Z",
		});
		const listed = (await (await call("GET", "?since=1", "user-1")).json()) as { decks: unknown[] };

		expect(deleted.status).toBe(204);
		expect(listed.decks).toEqual([
			expect.objectContaining({ id: DECK_ID, name: "", deletedAt: "2026-11-27T13:00:00.000Z" }),
		]);
	});

	it("answers 400 for an invalid deck id or cursor", async () => {
		const { call } = buildApp();

		expect((await call("PUT", "/deck-1", "user-1", BODY)).status).toBe(400);
		expect((await call("GET", "?since=abc", "user-1")).status).toBe(400);
	});

	it("answers 422 for a body that breaks the schema", async () => {
		const { call } = buildApp();

		expect((await call("PUT", `/${DECK_ID}`, "user-1", { ...BODY, main: [0] })).status).toBe(422);
	});

	it("answers 422 for a new deck past the limit", async () => {
		const { call, decks } = buildApp();
		for (let index = 0; index < MAX_LIVE_DECKS; index++) {
			await decks.saveIfNewer("user-1", deckMother({ id: newDeckId() }));
		}

		expect((await call("PUT", `/${DECK_ID}`, "user-1", BODY)).status).toBe(422);
	});

	it("answers 401 without a token", async () => {
		const { call } = buildApp();

		expect((await call("GET", "")).status).toBe(401);
		expect((await call("PUT", `/${DECK_ID}`, undefined, BODY)).status).toBe(401);
		expect(
			(await call("DELETE", `/${DECK_ID}`, undefined, { deletedAt: BODY.updatedAt })).status,
		).toBe(401);
	});
});
