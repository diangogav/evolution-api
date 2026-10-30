import { describe, expect, it } from "bun:test";

import {
	CARD_FRAME_LAYOUT,
	isSafeKitPath,
	parseCardFrameLayout,
} from "../../../../../src/modules/catalog/domain/CardFrameKit";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";

const layout = (value: unknown) => JSON.stringify(value);

describe("parseCardFrameLayout", () => {
	it("accepts a canvas and art window and ignores extra fields", () => {
		const parsed = parseCardFrameLayout(
			layout({
				canvas: [813, 1185],
				artWindow: { x: 98, y: 214, w: 617, h: 617 },
				layers: { frame: "frame/normal.png" },
			}),
		);

		expect(parsed).toEqual({
			canvas: [813, 1185],
			artWindow: { x: 98, y: 214, w: 617, h: 617 },
		});
	});

	it("reads the manifest from bytes", () => {
		const bytes = new TextEncoder().encode(
			layout({ canvas: [10, 20], artWindow: { x: 0, y: 0, w: 1, h: 1 } }),
		);

		expect(parseCardFrameLayout(bytes).canvas).toEqual([10, 20]);
	});

	const rejects: [string, string, string][] = [
		["invalid JSON", "{", `${CARD_FRAME_LAYOUT} is not valid JSON`],
		["an array", "[]", `${CARD_FRAME_LAYOUT} must be a JSON object`],
		["null", "null", `${CARD_FRAME_LAYOUT} must be a JSON object`],
		[
			"a missing canvas",
			layout({ artWindow: { x: 0, y: 0, w: 1, h: 1 } }),
			`${CARD_FRAME_LAYOUT} canvas must be two positive integers`,
		],
		[
			"a canvas with one value",
			layout({ canvas: [10], artWindow: { x: 0, y: 0, w: 1, h: 1 } }),
			`${CARD_FRAME_LAYOUT} canvas must be two positive integers`,
		],
		[
			"a canvas with a zero or fractional size",
			layout({ canvas: [0, 10.5], artWindow: { x: 0, y: 0, w: 1, h: 1 } }),
			`${CARD_FRAME_LAYOUT} canvas must be two positive integers`,
		],
		[
			"a missing art window",
			layout({ canvas: [10, 10] }),
			`${CARD_FRAME_LAYOUT} artWindow must be an object with numeric x, y, w, h`,
		],
		[
			"an art window with a non-numeric field",
			layout({ canvas: [10, 10], artWindow: { x: "0", y: 0, w: 1, h: 1 } }),
			`${CARD_FRAME_LAYOUT} artWindow must be an object with numeric x, y, w, h`,
		],
		[
			"an art window with no area",
			layout({ canvas: [10, 10], artWindow: { x: 0, y: 0, w: 0, h: 1 } }),
			`${CARD_FRAME_LAYOUT} artWindow w and h must be greater than 0`,
		],
	];

	for (const [label, source, message] of rejects) {
		it(`rejects ${label}`, () => {
			expect(() => parseCardFrameLayout(source)).toThrow(InvalidArgumentError);
			expect(() => parseCardFrameLayout(source)).toThrow(message);
		});
	}
});

describe("isSafeKitPath", () => {
	it("accepts flat names and up to three segments", () => {
		for (const path of ["layout.json", "frame/normal.png", "digits/atk/1.png", "a-b/C_d.1.png"]) {
			expect(isSafeKitPath(path)).toBe(true);
		}
	});

	it("rejects traversal, absolute, backslash, empty segments and deep paths", () => {
		for (const path of [
			"../layout.json",
			"frame/../layout.json",
			"./frame.png",
			"/frame.png",
			"frame\\normal.png",
			"frame//normal.png",
			"frame/",
			"",
			"a/b/c/d.png",
			"frame/.hidden.png",
			"frame/normal png.png",
		]) {
			expect(isSafeKitPath(path)).toBe(false);
		}
	});
});
