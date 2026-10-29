import { t } from "elysia";

const Passcodes = t.Array(t.Integer({ minimum: 1 }));

export const CommunityDeckSchema = t.Object({
	id: t.String({ format: "uuid" }),
	name: t.String(),
	author: t.String({ description: "The deck's author on its source site" }),
	format: t.String({
		description: "Label of the ban list the deck is legal in, e.g. 2010.3 Edison",
	}),
	source: t.Literal("ygoprodeck"),
	sourceUrl: t.String({ description: "The deck's page on its source site" }),
	cover: t.Integer({ description: "Passcode of the card shown as the deck's cover" }),
	main: Passcodes,
	extra: Passcodes,
	side: Passcodes,
	views: t.Integer({ minimum: 0 }),
	updatedAt: t.String({ format: "date-time" }),
});

export const CommunityDeckPageSchema = t.Object({
	items: t.Array(CommunityDeckSchema),
	page: t.Integer({ minimum: 1 }),
	pageSize: t.Integer({ minimum: 1 }),
	total: t.Integer({ minimum: 0 }),
});

export const CommunityDeckFormatsSchema = t.Array(
	t.Object({ format: t.String(), count: t.Integer({ minimum: 0 }) }),
);
