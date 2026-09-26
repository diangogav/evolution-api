import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { BanListGetter } from "../../../../../src/modules/ban-list/application/BanListGetter";
import { GroupedBanListGetter } from "../../../../../src/modules/ban-list/application/GroupedBanListGetter";
import { BanListRepository } from "../../../../../src/modules/ban-list/domain/BanListRepository";
import {
	BanListNamesSchema,
	GroupedBanListsSchema,
} from "../../../../../src/modules/ban-list/infrastructure/BanListSchemas";

const repository: BanListRepository = {
	get: async () => ["Edison", "TCG"],
	getGrouped: async () => [
		{ name: "Global", type: "global", banLists: [] },
		{ name: "Edison", type: "group", banLists: ["March 2010 Edison"] },
		{ name: "TCG", type: "banlist", banLists: [] },
	],
};

describe("BanListSchemas", () => {
	it("accepts the bare names BanListGetter returns and rejects the old object example", async () => {
		expect(Value.Check(BanListNamesSchema, await new BanListGetter(repository).get(7))).toBe(true);
		expect(Value.Check(BanListNamesSchema, [{ id: "banlist-1", name: "Edison" }])).toBe(false);
	});

	it("accepts the sections GroupedBanListGetter returns and rejects an unknown type", async () => {
		const sections = await new GroupedBanListGetter(repository).get(7);

		expect(Value.Check(GroupedBanListsSchema, sections)).toBe(true);
		expect(
			Value.Check(GroupedBanListsSchema, [{ name: "Edison", type: "format", banLists: [] }]),
		).toBe(false);
	});
});
