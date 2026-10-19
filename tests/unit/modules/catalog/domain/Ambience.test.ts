import { describe, expect, it } from "bun:test";

import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import {
	type AmbienceMote,
	parseAmbience,
} from "../../../../../src/modules/catalog/domain/Ambience";

const parsedValid: { motes: AmbienceMote[]; sweep: string } = {
	motes: [
		{ shape: "ember", colors: ["#ff8a3d", "#ffb347"], share: 0.8 },
		{ shape: "spark", colors: ["#ffe28a"], share: 0.2 },
	],
	sweep: "#ffb380",
};
const valid = { version: 1, ...parsedValid };

describe("parseAmbience", () => {
	it("parses motes and sweep", () => {
		expect(parseAmbience(JSON.stringify(valid))).toEqual(parsedValid);
	});

	it("accepts bytes and treats sweep as optional", () => {
		const { sweep: _sweep, ...rest } = parsedValid;
		const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, ...rest }));

		expect(parseAmbience(bytes)).toEqual(rest);
	});

	it("accepts shares that do not sum to one", () => {
		const raw = { version: 1, motes: [{ shape: "snow", colors: ["#ffffff"], share: 7 }] };

		expect(parseAmbience(JSON.stringify(raw)).motes[0]?.share).toBe(7);
	});

	it("ignores unknown keys", () => {
		const raw = {
			...valid,
			wind: 3,
			motes: [{ shape: "ember", colors: ["#ff8a3d"], share: 1, size: 9 }],
		};
		const parsed = parseAmbience(JSON.stringify(raw));

		expect(parsed).not.toHaveProperty("wind");
		expect(parsed.motes[0]).not.toHaveProperty("size");
	});

	it("rejects invalid JSON and non-object roots", () => {
		expect(() => parseAmbience("{")).toThrow(InvalidArgumentError);
		expect(() => parseAmbience("[]")).toThrow("must be a JSON object");
	});

	it("rejects a version other than 1", () => {
		expect(() => parseAmbience(JSON.stringify({ ...valid, version: 2 }))).toThrow("version");
	});

	it("rejects missing, empty or oversized motes", () => {
		const { motes: _motes, ...noMotes } = valid;
		expect(() => parseAmbience(JSON.stringify(noMotes))).toThrow("motes");
		expect(() => parseAmbience(JSON.stringify({ ...valid, motes: [] }))).toThrow("motes");
		const shapes = ["leaf", "spark", "ember", "snow", "petal", "bubble", "bat", "leaf"];
		const eight = shapes.map((shape) => ({ shape, colors: ["#ffffff"], share: 1 }));
		expect(() => parseAmbience(JSON.stringify({ ...valid, motes: eight }))).toThrow("motes");
	});

	it("rejects an unknown shape", () => {
		const raw = { ...valid, motes: [{ shape: "star", colors: ["#ffffff"], share: 1 }] };

		expect(() => parseAmbience(JSON.stringify(raw))).toThrow("shape");
	});

	it("rejects a bad mote colour and a bad colour count", () => {
		const bad = { ...valid, motes: [{ shape: "ember", colors: ["orange"], share: 1 }] };
		expect(() => parseAmbience(JSON.stringify(bad))).toThrow("colors");
		const none = { ...valid, motes: [{ shape: "ember", colors: [], share: 1 }] };
		expect(() => parseAmbience(JSON.stringify(none))).toThrow("colors");
		const nine = Array.from({ length: 9 }, () => "#ffffff");
		const many = { ...valid, motes: [{ shape: "ember", colors: nine, share: 1 }] };
		expect(() => parseAmbience(JSON.stringify(many))).toThrow("colors");
	});

	it("rejects duplicate shapes", () => {
		const raw = {
			...valid,
			motes: [
				{ shape: "ember", colors: ["#ffffff"], share: 1 },
				{ shape: "ember", colors: ["#000000"], share: 1 },
			],
		};

		expect(() => parseAmbience(JSON.stringify(raw))).toThrow("duplicate");
	});

	it("rejects a share that is not a positive number", () => {
		for (const share of [0, -1, "1", null]) {
			const raw = { ...valid, motes: [{ shape: "ember", colors: ["#ffffff"], share }] };
			expect(() => parseAmbience(JSON.stringify(raw))).toThrow("share");
		}
	});

	it("rejects an invalid sweep", () => {
		expect(() => parseAmbience(JSON.stringify({ ...valid, sweep: "#fff" }))).toThrow("sweep");
	});
});
