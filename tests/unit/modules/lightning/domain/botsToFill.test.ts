import { describe, expect, it } from "bun:test";

import { botsToFill } from "../../../../../src/modules/lightning/domain/LightningBotAccount";

const roster = ["a", "b", "c"].map((id) => ({ userId: `bot-${id}`, format: "tcg", botName: id }));

const fill = (overrides: Partial<Parameters<typeof botsToFill>[0]> = {}) =>
	botsToFill({
		humanEntries: 2,
		activeEntries: 2,
		minPlayers: 4,
		registeredUserIds: new Set(),
		roster,
		...overrides,
	}).map((bot) => bot.userId);

describe("botsToFill", () => {
	it("fills the field up to its minimum in roster order", () => {
		expect(fill()).toEqual(["bot-a", "bot-b"]);
	});

	it("adds no bot below two human entries", () => {
		expect(fill({ humanEntries: 1, activeEntries: 1 })).toEqual([]);
	});

	it("adds no bot when the minimum is already met", () => {
		expect(fill({ humanEntries: 4, activeEntries: 4 })).toEqual([]);
	});

	it("stops when the roster runs out", () => {
		expect(fill({ minPlayers: 8 })).toEqual(["bot-a", "bot-b", "bot-c"]);
	});

	it("skips a bot already registered in the tournament", () => {
		expect(fill({ activeEntries: 3, registeredUserIds: new Set(["bot-a"]) })).toEqual(["bot-b"]);
	});
});
