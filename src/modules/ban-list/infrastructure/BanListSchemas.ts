import { t } from "elysia";

/** Response of GET /ban-lists: the ban list names played during the season. */
export const BanListNamesSchema = t.Array(t.String());

export const BanListSectionSchema = t.Object({
	name: t.String({ description: "A valid banListName for the leaderboard" }),
	type: t.Union([t.Literal("global"), t.Literal("group"), t.Literal("banlist")]),
	banLists: t.Array(t.String(), { description: "Ban lists a group contains; empty otherwise" }),
});

/** Response of GET /ban-lists/grouped. */
export const GroupedBanListsSchema = t.Array(BanListSectionSchema);
