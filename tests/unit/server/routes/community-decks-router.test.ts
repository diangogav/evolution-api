import { describe, expect, it, mock } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { Elysia } from "elysia";

import { ListCommunityDeckFormats } from "../../../../src/modules/community-decks/application/ListCommunityDeckFormats";
import { ListCommunityDecks } from "../../../../src/modules/community-decks/application/ListCommunityDecks";
import type {
	CommunityDeckSearch,
	CommunityDeckView,
} from "../../../../src/modules/community-decks/domain/CommunityDeckRepository";
import {
	CommunityDeckFormatsSchema,
	CommunityDeckPageSchema,
} from "../../../../src/modules/community-decks/infrastructure/CommunityDeckSchemas";
import { createCommunityDecksRouter } from "../../../../src/server/routes/community-decks-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";

const deck: CommunityDeckView = {
	id: "8d6f0c1e-2b8a-4d55-9e0b-1f3f6a7c2d10",
	name: "Fairies",
	author: "Duelist",
	format: "2010.3 Edison",
	source: "ygoprodeck",
	sourceUrl: "https://ygoprodeck.com/deck/fairies-edison-741607",
	cover: 69514125,
	main: [27288416, 27288416],
	extra: [25958491],
	side: [],
	views: 610,
	updatedAt: new Date("2026-10-15T12:00:00.000Z"),
};

function setup() {
	const search = mock(async (_query: CommunityDeckSearch) => ({ items: [deck], total: 49 }));
	const formats = mock(async () => [
		{ format: "2026.9 TCG", count: 120 },
		{ format: "2010.3 Edison", count: 37 },
	]);
	const app = new Elysia().onError(mapDomainErrorStatus).use(
		createCommunityDecksRouter({
			listDecks: new ListCommunityDecks({ search }),
			listFormats: new ListCommunityDeckFormats({ formats }),
		}),
	);
	const get = (path: string) => app.handle(new Request(`http://localhost${path}`));
	return { get, search };
}

describe("GET /community-decks", () => {
	it("answers a page of decks with the default paging", async () => {
		const { get, search } = setup();

		const response = await get("/community-decks");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(Value.Check(CommunityDeckPageSchema, body)).toBe(true);
		expect(body).toEqual({
			items: [{ ...deck, updatedAt: "2026-10-15T12:00:00.000Z" }],
			page: 1,
			pageSize: 24,
			total: 49,
		});
		expect(search.mock.calls[0][0]).toEqual({
			page: 1,
			pageSize: 24,
			format: undefined,
			q: undefined,
		});
	});

	it("passes the format, a trimmed search and the requested page", async () => {
		const { get, search } = setup();

		const response = await get(
			"/community-decks?format=2010.3%20Edison&q=%20fairy%20&page=3&pageSize=48",
		);

		expect(response.status).toBe(200);
		expect(search.mock.calls[0][0]).toEqual({
			format: "2010.3 Edison",
			q: "fairy",
			page: 3,
			pageSize: 48,
		});
		expect((await response.json()).page).toBe(3);
	});

	it("rejects a page size over 48, a page under 1 and non-numeric paging", async () => {
		const { get, search } = setup();

		for (const query of ["pageSize=49", "pageSize=0", "page=0", "page=abc", "page=1.5"]) {
			expect((await get(`/community-decks?${query}`)).status).toBe(422);
		}
		expect(search).not.toHaveBeenCalled();
	});
});

describe("GET /community-decks/formats", () => {
	it("lists every format with its number of decks", async () => {
		const response = await setup().get("/community-decks/formats");
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(Value.Check(CommunityDeckFormatsSchema, body)).toBe(true);
		expect(body).toEqual([
			{ format: "2026.9 TCG", count: 120 },
			{ format: "2010.3 Edison", count: 37 },
		]);
	});
});
