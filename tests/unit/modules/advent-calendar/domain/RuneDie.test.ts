import { describe, expect, it } from "bun:test";

import {
	dieBonus,
	DIE_FACES,
	rollRuneDie,
} from "../../../../../src/modules/advent-calendar/domain/RuneDie";

const DIE = {
	essence: [10, 20, 30, 40, 60],
	rare: { essence: 100, cosmeticIds: ["sleeve-frost"] },
};

describe("rollRuneDie", () => {
	it("maps the pick to a face from 1 to 6", () => {
		expect(rollRuneDie(() => 0)).toBe(1);
		expect(rollRuneDie(() => 5)).toBe(6);
	});

	it("asks for one of exactly six faces", () => {
		const sizes: number[] = [];
		rollRuneDie((size) => {
			sizes.push(size);
			return 0;
		});
		expect(sizes).toEqual([DIE_FACES]);
	});
});

describe("dieBonus", () => {
	it("pays the essence of faces 1 to 5", () => {
		expect(dieBonus(DIE, 1)).toEqual({ essence: 10, cosmeticIds: [] });
		expect(dieBonus(DIE, 5)).toEqual({ essence: 60, cosmeticIds: [] });
	});

	it("pays the rare prize on a 6", () => {
		expect(dieBonus(DIE, 6)).toEqual({ essence: 100, cosmeticIds: ["sleeve-frost"] });
	});

	it("rejects a face the die does not have", () => {
		expect(() => dieBonus(DIE, 0)).toThrow();
		expect(() => dieBonus(DIE, 7)).toThrow();
	});
});
