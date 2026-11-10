import { describe, expect, it } from "bun:test";

import type { FormatList, FormatListId } from "../../../../../src/modules/community-decks";
import { CommunityDeckLegalityChecker } from "../../../../../src/modules/lightning/infrastructure/CommunityDeckLegalityChecker";

const filler = (count: number, from = 1000) => Array.from({ length: count }, (_, i) => from + i);
const deck = (main = filler(40)) => ({ main, extra: [], side: [] });

function setup(lists: Partial<Record<FormatListId, FormatList>>) {
	const fetched: string[] = [];
	let now = 0;
	let failing = false;
	const checker = new CommunityDeckLegalityChecker(
		{
			fetch: async (id) => {
				fetched.push(id);
				if (failing) throw new Error("github down");
				const list = lists[id];
				if (!list) throw new Error(`no ${id}`);
				return list;
			},
		},
		{ fetch: async () => new Map([[1000, [910000001]]]) },
		60_000,
		() => now,
	);
	return {
		checker,
		fetched,
		advance: (ms: number) => {
			now += ms;
		},
		fail: () => {
			failing = true;
		},
	};
}

const blacklist = (entries: Array<[number, number]>, label = "2026.9 TCG"): FormatList => ({
	label,
	whitelist: false,
	limits: new Map(entries),
});

describe("CommunityDeckLegalityChecker", () => {
	it("validates against the format's list and explains a rejection", async () => {
		const { checker } = setup({ tcg: blacklist([[1001, 0]]) });

		expect(await checker.check("tcg", deck(filler(40, 2000)))).toEqual({ legal: true });
		expect(await checker.check("tcg", deck())).toEqual({
			legal: false,
			reason: "card 1001 is not allowed in 2026.9 TCG",
		});
		expect(await checker.check("tcg", deck(filler(39)))).toMatchObject({ legal: false });
	});

	it("reads each format's own list, JTP included", async () => {
		const { checker, fetched } = setup({
			edison: blacklist([], "2010.3 Edison"),
			jtp: blacklist([], "JTP"),
		});

		await checker.check("edison", deck());
		await checker.check("jtp", deck());

		expect(fetched).toEqual(["edison", "jtp"]);
	});

	it("caches lists for the TTL and keeps the last good list when a refresh fails", async () => {
		const { checker, fetched, advance, fail } = setup({ tcg: blacklist([]) });

		await checker.check("tcg", deck());
		await checker.check("tcg", deck());
		expect(fetched).toEqual(["tcg"]);

		advance(60_001);
		fail();
		expect(await checker.check("tcg", deck())).toEqual({ legal: true });
		expect(fetched).toEqual(["tcg", "tcg"]);
	});

	it("fails when no list was ever loaded", async () => {
		const { checker, fail } = setup({ tcg: blacklist([]) });
		fail();

		await expect(checker.check("tcg", deck())).rejects.toThrow("github down");
	});
});
