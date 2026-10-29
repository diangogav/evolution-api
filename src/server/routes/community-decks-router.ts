import { Elysia, t } from "elysia";

import { ListCommunityDeckFormats } from "../../modules/community-decks/application/ListCommunityDeckFormats";
import {
	COMMUNITY_DECKS_DEFAULT_PAGE_SIZE,
	COMMUNITY_DECKS_MAX_PAGE_SIZE,
	ListCommunityDecks,
} from "../../modules/community-decks/application/ListCommunityDecks";
import {
	CommunityDeckFormatsSchema,
	CommunityDeckPageSchema,
} from "../../modules/community-decks/infrastructure/CommunityDeckSchemas";
import { CommunityDeckPostgresRepository } from "../../modules/community-decks/infrastructure/CommunityDeckPostgresRepository";
import { errorResponses, jsonOk } from "../openapi/responses";

type Dependencies = {
	listDecks: ListCommunityDecks;
	listFormats: ListCommunityDeckFormats;
};

const EXAMPLE_DECK = {
	id: "8d6f0c1e-2b8a-4d55-9e0b-1f3f6a7c2d10",
	name: "Fairies",
	author: "Duelist",
	format: "2010.3 Edison",
	source: "ygoprodeck" as const,
	sourceUrl: "https://ygoprodeck.com/deck/fairies-edison-741607",
	cover: 69514125,
	main: [27288416, 27288416, 5645210],
	extra: [25958491],
	side: [],
	views: 610,
	updatedAt: "2026-10-15T12:00:00.000Z",
};

export const createCommunityDecksRouter = ({ listDecks, listFormats }: Dependencies) =>
	new Elysia({ prefix: "/community-decks" })
		.get("/", ({ query }) => listDecks.run(query), {
			detail: {
				tags: ["Ban Lists"],
				summary: "List community decks",
				description:
					"Pages through legal decks synced from YGOPRODeck, most viewed first. Every deck already passed its format's ban list, copy limits and deck sizes; Edison decks carry our pre-errata card ids. Filter by format label (see /community-decks/formats) and search name or author with q (case-insensitive). Public: no credentials required.",
				responses: {
					200: jsonOk(CommunityDeckPageSchema, "Decks retrieved successfully", {
						items: [EXAMPLE_DECK],
						page: 1,
						pageSize: COMMUNITY_DECKS_DEFAULT_PAGE_SIZE,
						total: 1,
					}),
					...errorResponses(422),
				},
			},
			query: t.Object({
				format: t.Optional(
					t.String({ maxLength: 64, description: "Format label, e.g. 2010.3 Edison" }),
				),
				q: t.Optional(t.String({ maxLength: 100, description: "Matches deck name or author" })),
				page: t.Integer({ minimum: 1, default: 1 }),
				pageSize: t.Integer({
					minimum: 1,
					maximum: COMMUNITY_DECKS_MAX_PAGE_SIZE,
					default: COMMUNITY_DECKS_DEFAULT_PAGE_SIZE,
				}),
			}),
			response: { 200: CommunityDeckPageSchema },
		})
		.get("/formats", () => listFormats.run(), {
			detail: {
				tags: ["Ban Lists"],
				summary: "List community deck formats",
				description:
					"Lists the format labels that have community decks, with how many decks each one has, most decks first. Public: no credentials required.",
				responses: {
					200: jsonOk(CommunityDeckFormatsSchema, "Formats retrieved successfully", [
						{ format: "2026.9 TCG", count: 120 },
						{ format: "2010.3 Edison", count: 37 },
					]),
				},
			},
			response: { 200: CommunityDeckFormatsSchema },
		});

const repository = new CommunityDeckPostgresRepository();

export const communityDecksRouter = createCommunityDecksRouter({
	listDecks: new ListCommunityDecks(repository),
	listFormats: new ListCommunityDeckFormats(repository),
});
