import { describe, expect, it } from "bun:test";

import { parseCardAlternates } from "../../../../../src/modules/community-decks/infrastructure/parseCardAlternates";

describe("parseCardAlternates", () => {
	it("maps each original passcode to its alternate ids", () => {
		const map = parseCardAlternates({
			version: 1,
			alternates: { "29071332": ["910003009"], "46986414": ["36996508", "46986415"] },
		});

		expect(map).toEqual(
			new Map([
				[29071332, [910003009]],
				[46986414, [36996508, 46986415]],
			]),
		);
	});

	it("rejects an unknown version or shape", () => {
		expect(() => parseCardAlternates({ version: 2, alternates: {} })).toThrow();
		expect(() => parseCardAlternates({ version: 1, alternates: { x: ["1"] } })).toThrow();
		expect(() => parseCardAlternates({ version: 1, alternates: { "1": "2" } })).toThrow();
		expect(() => parseCardAlternates([])).toThrow();
	});
});
