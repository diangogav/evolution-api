import { Elysia, t } from "elysia";

import { DeleteMyDeck } from "../../modules/user-decks/application/DeleteMyDeck";
import { ListMyDeckChanges } from "../../modules/user-decks/application/ListMyDeckChanges";
import { SaveMyDeck } from "../../modules/user-decks/application/SaveMyDeck";
import type { StoredUserDeck } from "../../modules/user-decks/domain/UserDeck";
import { UserDeckPostgresRepository } from "../../modules/user-decks/infrastructure/UserDeckPostgresRepository";
import {
	DeckChangesSchema,
	DeleteDeckBodySchema,
	SaveDeckBodySchema,
	StoredDeckSchema,
} from "../../modules/user-decks/infrastructure/UserDeckSchemas";
import { requireUser as defaultRequireUser } from "../auth/requireUser";
import { emptyOk, errorResponses, jsonOk } from "../openapi/responses";

export interface MeDecksRouterDependencies {
	readonly requireUser: typeof defaultRequireUser;
	readonly list: Pick<ListMyDeckChanges, "run">;
	readonly save: Pick<SaveMyDeck, "run">;
	readonly remove: Pick<DeleteMyDeck, "run">;
}

const DeckIdParams = t.Object({ id: t.String({ minLength: 1, maxLength: 64 }) });

const EXAMPLE = {
	id: "8f14e45f-ceea-467a-9575-3f1a2b6c7d8e",
	name: "Blue-Eyes",
	format: "tcg",
	main: [89631139, 89631139, 89631139],
	extra: [],
	side: [],
	createdAt: "2026-11-20T18:04:00.000Z",
	updatedAt: "2026-11-27T09:30:00.000Z",
	deletedAt: null,
	revision: "42",
};

export function createMeDecksRouter(deps: MeDecksRouterDependencies) {
	return new Elysia({ prefix: "/me/decks" }).guard({}, (app) =>
		app
			.use(deps.requireUser)
			.get(
				"",
				async ({ userId, query }) => {
					const changes = await deps.list.run({ userId, since: query.since ?? "0" });
					return { decks: changes.decks.map(toWire), cursor: changes.cursor };
				},
				{
					query: t.Object({ since: t.Optional(t.String({ maxLength: 19 })) }),
					detail: {
						tags: ["My Decks"],
						summary: "List changes to my decks",
						description:
							"Every write to the caller's decks after `since`, oldest first, deletions included (`deletedAt` set, contents empty). Without `since` it answers every deck. Send the answered `cursor` as `since` next time.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(DeckChangesSchema, "The changes and the next cursor", {
								decks: [EXAMPLE],
								cursor: "42",
							}),
							...errorResponses(400, 401, 403),
						},
					},
				},
			)
			.put(
				"/:id",
				async ({ userId, params, body }) =>
					toWire(
						await deps.save.run({
							userId,
							deck: {
								id: params.id,
								name: body.name,
								format: body.format,
								main: body.main,
								extra: body.extra,
								side: body.side,
								createdAt: new Date(body.createdAt),
								updatedAt: new Date(body.updatedAt),
							},
						}),
					),
				{
					params: DeckIdParams,
					body: SaveDeckBodySchema,
					detail: {
						tags: ["My Decks"],
						summary: "Save one of my decks",
						description:
							"Stores the deck under its client id. The copy changed last wins: when the stored copy (or its deletion) is newer, the call stores nothing and answers the stored copy, so the device can adopt it. Saving a deleted deck with a newer `updatedAt` brings it back. Answers 422 when a new deck would pass 300 decks.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(StoredDeckSchema, "The deck as stored", EXAMPLE),
							...errorResponses(400, 401, 403, 422),
						},
					},
				},
			)
			.delete(
				"/:id",
				async ({ userId, params, body, set }) => {
					await deps.remove.run({ userId, id: params.id, deletedAt: new Date(body.deletedAt) });
					set.status = 204;
				},
				{
					params: DeckIdParams,
					body: DeleteDeckBodySchema,
					detail: {
						tags: ["My Decks"],
						summary: "Delete one of my decks",
						description:
							"Deletes the deck on every device of the caller, unless it was edited after `deletedAt`. The deck stays as a tombstone so other devices learn about it. Idempotent; a deck the API has not seen yet is recorded as deleted too.",
						security: [{ bearerAuth: [] }],
						responses: {
							204: emptyOk("The deck is deleted, or a newer copy was kept"),
							...errorResponses(400, 401, 403, 422),
						},
					},
				},
			),
	);
}

function toWire(deck: StoredUserDeck) {
	return {
		...deck,
		createdAt: deck.createdAt.toISOString(),
		updatedAt: deck.updatedAt.toISOString(),
		deletedAt: deck.deletedAt?.toISOString() ?? null,
	};
}

const repository = new UserDeckPostgresRepository();

export const meDecksRouter = createMeDecksRouter({
	requireUser: defaultRequireUser,
	list: new ListMyDeckChanges(repository),
	save: new SaveMyDeck(repository),
	remove: new DeleteMyDeck(repository),
});
