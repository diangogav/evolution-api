import { describe, expect, it } from "bun:test";

import {
	avatarConfig,
	isAvatarConfig,
	MAX_AVATAR_ENTRIES,
} from "../../../../../src/modules/player-avatars/domain/AvatarConfig";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";

const entries = (count: number) =>
	Object.fromEntries(
		Array.from({ length: count }, (_, i) => [
			`k${String.fromCharCode(97 + (i % 26))}${"x".repeat(Math.floor(i / 26))}`,
			"v",
		]),
	);

const invalid: unknown[] = [
	null,
	"x",
	[],
	42,
	{ "": "v" },
	{ hair_style: "v" },
	{ ["a".repeat(25)]: "v" },
	{ hairStyle: "" },
	{ hairStyle: "Spiky" },
	{ hairStyle: "a b" },
	{ hairStyle: "<script>" },
	{ hairStyle: "a".repeat(33) },
	{ hairStyle: 5 },
	entries(MAX_AVATAR_ENTRIES + 1),
];

describe("avatarConfig", () => {
	it("accepts an object of short slug values", () => {
		expect(avatarConfig({ hairStyle: "spiky", hairColor: "dark-brown" })).toEqual({
			hairStyle: "spiky",
			hairColor: "dark-brown",
		});
	});

	it("accepts exactly 24 entries", () => {
		expect(Object.keys(avatarConfig(entries(MAX_AVATAR_ENTRIES)))).toHaveLength(24);
	});

	for (const value of invalid) {
		it(`rejects ${JSON.stringify(value)?.slice(0, 40)}`, () => {
			expect(() => avatarConfig(value)).toThrow(InvalidArgumentError);
		});
	}

	it("returns a frozen copy", () => {
		const input = { hairStyle: "bob" };
		const result = avatarConfig(input);
		input.hairStyle = "afro";
		expect(result).toEqual({ hairStyle: "bob" });
		expect(Object.isFrozen(result)).toBe(true);
	});
});

describe("isAvatarConfig", () => {
	it("mirrors the rules without throwing", () => {
		expect(isAvatarConfig({ hairStyle: "spiky" })).toBe(true);
		for (const value of invalid) expect(isAvatarConfig(value)).toBe(false);
	});
});
