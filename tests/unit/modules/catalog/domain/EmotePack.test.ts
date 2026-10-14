import { describe, expect, it } from "bun:test";

import {
	assertEmotePackFiles,
	MAX_EMOTE_PACK_FILES,
} from "../../../../../src/modules/catalog/domain/EmotePack";

const encoder = new TextEncoder();

function lottie(): Uint8Array {
	return encoder.encode(
		JSON.stringify({ v: "5.7.4", fr: 30, ip: 0, op: 30, w: 100, h: 100, layers: [] }),
	);
}

function manifest(emotes: unknown, version: unknown = 1): { name: string; bytes: Uint8Array } {
	return { name: "pack.json", bytes: encoder.encode(JSON.stringify({ version, emotes })) };
}

function emote(key: string, label = key, file = `${key}.json`) {
	return { key, label, file };
}

function files(keys: string[]) {
	return keys.map((key) => ({ name: `${key}.json`, bytes: lottie() }));
}

function reject(slug: string, input: Parameters<typeof assertEmotePackFiles>[1], message: string) {
	expect(() => assertEmotePackFiles(slug, input)).toThrow(message);
}

describe("assertEmotePackFiles", () => {
	it("accepts a manifest whose emotes match the uploaded Lottie files", () => {
		expect(() =>
			assertEmotePackFiles("halloween", [
				manifest([emote("attack", "Attack"), emote("ghost-wave", "Ghost wave")]),
				...files(["attack", "ghost-wave"]),
			]),
		).not.toThrow();
	});

	it("allows 13 files: pack.json plus 12 emotes", () => {
		const keys = Array.from({ length: 12 }, (_, index) => `e${index}`);
		expect(MAX_EMOTE_PACK_FILES).toBe(13);
		expect(() =>
			assertEmotePackFiles("big", [manifest(keys.map((key) => emote(key))), ...files(keys)]),
		).not.toThrow();
	});

	it("rejects a pack without pack.json", () => {
		reject("halloween", files(["attack"]), "EMOTE_PACK requires exactly one pack.json");
	});

	it("rejects a pack with no Lottie files", () => {
		reject("halloween", [manifest([])], "EMOTE_PACK requires between 1 and 12 emotes");
	});

	it("rejects more than 12 Lottie files", () => {
		const keys = Array.from({ length: 13 }, (_, index) => `e${index}`);
		reject(
			"big",
			[manifest(keys.map((key) => emote(key))), ...files(keys)],
			"EMOTE_PACK requires between 1 and 12 emotes",
		);
	});

	it("rejects an uploaded file that is not .json", () => {
		reject(
			"halloween",
			[manifest([emote("attack")]), ...files(["attack"]), { name: "attack.png", bytes: lottie() }],
			'EMOTE_PACK file "attack.png" must be pack.json or a .json Lottie',
		);
	});

	it("rejects a pack.json that is not valid JSON", () => {
		reject(
			"halloween",
			[{ name: "pack.json", bytes: encoder.encode("{") }, ...files(["attack"])],
			"pack.json is not valid JSON",
		);
	});

	it("rejects an unsupported manifest version", () => {
		reject(
			"halloween",
			[manifest([emote("attack")], 2), ...files(["attack"])],
			"pack.json version must be 1",
		);
	});

	it("rejects a manifest without an emotes array", () => {
		reject(
			"halloween",
			[manifest("nope"), ...files(["attack"])],
			"pack.json requires an emotes array",
		);
	});

	it("rejects emote keys that are not kebab-case or are too long", () => {
		for (const key of ["Attack", "a_b", "-a", "a--b", "", "k".repeat(21)]) {
			reject(
				"halloween",
				[manifest([emote(key, "x", "x.json")]), ...files(["x"])],
				"pack.json emote key",
			);
		}
	});

	it("rejects duplicate keys", () => {
		reject(
			"halloween",
			[manifest([emote("attack"), emote("attack")]), ...files(["attack"])],
			'pack.json repeats emote key "attack"',
		);
	});

	it("rejects labels that are empty after trimming or longer than 32 characters", () => {
		reject(
			"halloween",
			[manifest([emote("attack", "   ")]), ...files(["attack"])],
			'pack.json emote "attack" needs a label of 1 to 32 characters',
		);
		reject(
			"halloween",
			[manifest([emote("attack", "l".repeat(33))]), ...files(["attack"])],
			'pack.json emote "attack" needs a label of 1 to 32 characters',
		);
	});

	it("rejects a file that is not <key>.json", () => {
		reject(
			"halloween",
			[manifest([emote("attack", "Attack", "other.json")]), ...files(["attack"])],
			'pack.json emote "attack" must use file "attack.json"',
		);
	});

	it("rejects a listed emote whose file was not uploaded", () => {
		reject(
			"halloween",
			[manifest([emote("attack"), emote("wave")]), ...files(["attack"])],
			'pack.json lists "wave.json" but it was not uploaded',
		);
	});

	it("rejects an uploaded Lottie that pack.json does not list", () => {
		reject(
			"halloween",
			[manifest([emote("attack")]), ...files(["attack", "extra"])],
			'"extra.json" is not listed in pack.json',
		);
	});

	it("rejects an emote ref above 48 bytes", () => {
		const slug = "s".repeat(30);
		const key = "k".repeat(19);
		reject(
			slug,
			[manifest([emote(key)]), ...files([key])],
			`emote ref "${slug}/${key}" exceeds 48 bytes`,
		);
	});

	it("accepts an emote ref of exactly 48 bytes", () => {
		const slug = "s".repeat(30);
		const key = "k".repeat(17);
		expect(() =>
			assertEmotePackFiles(slug, [manifest([emote(key)]), ...files([key])]),
		).not.toThrow();
	});

	it("validates every Lottie file", () => {
		reject(
			"halloween",
			[manifest([emote("attack")]), { name: "attack.json", bytes: encoder.encode("[]") }],
			"attack.json must be a JSON object",
		);
	});
});
