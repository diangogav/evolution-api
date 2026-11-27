import { t } from "elysia";

const CardCodes = (max: number) => t.Array(t.Integer({ minimum: 1 }), { maxItems: max });

/** Body of PUT /me/decks/:id. Bounds are checked again by the use case. */
export const SaveDeckBodySchema = t.Object({
	name: t.String({ minLength: 1, maxLength: 64 }),
	format: t.Union([t.String({ minLength: 1, maxLength: 32 }), t.Null()]),
	main: CardCodes(80),
	extra: CardCodes(30),
	side: CardCodes(30),
	createdAt: t.String({ format: "date-time" }),
	updatedAt: t.String({ format: "date-time", description: "When the device last edited the deck" }),
});

/** Body of DELETE /me/decks/:id. */
export const DeleteDeckBodySchema = t.Object({
	deletedAt: t.String({ format: "date-time", description: "When the device deleted the deck" }),
});

export const StoredDeckSchema = t.Object({
	id: t.String({ format: "uuid" }),
	name: t.String({ description: "Empty for a deleted deck" }),
	format: t.Union([t.String(), t.Null()]),
	main: t.Array(t.Integer()),
	extra: t.Array(t.Integer()),
	side: t.Array(t.Integer()),
	createdAt: t.String({ format: "date-time" }),
	updatedAt: t.String({ format: "date-time" }),
	deletedAt: t.Union([t.String({ format: "date-time" }), t.Null()], {
		description: "Set when the deck was deleted; its contents are then empty",
	}),
	revision: t.String({ description: "Order of this write among the caller's deck writes" }),
});

/** Response of GET /me/decks. */
export const DeckChangesSchema = t.Object({
	decks: t.Array(StoredDeckSchema),
	cursor: t.String({ description: "Send it as `since` to get only later changes" }),
});
