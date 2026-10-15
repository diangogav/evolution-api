import { describe, expect, it } from "bun:test";

import { DEFAULT_EMOTE_IDS, EmoteRef } from "../../../../../src/modules/emote-bar/domain/EmoteRef";

describe("EmoteRef", () => {
	it("lists the bundled default emotes in bar order", () => {
		expect(DEFAULT_EMOTE_IDS).toEqual([
			"wave",
			"thumbsup",
			"fire",
			"thinking",
			"cool",
			"mindblown",
			"sweat",
			"cry",
		]);
	});

	it("parses a default emote id", () => {
		const ref = EmoteRef.parse("fire");

		expect(ref.isDefault).toBe(true);
		expect(ref.packSlug).toBeNull();
		expect(ref.emoteKey).toBeNull();
		expect(ref.toString()).toBe("fire");
	});

	it("parses a pack emote reference", () => {
		const ref = EmoteRef.parse("halloween-duelist/ghost-wave");

		expect(ref.isDefault).toBe(false);
		expect(ref.packSlug).toBe("halloween-duelist");
		expect(ref.emoteKey).toBe("ghost-wave");
		expect(ref.toString()).toBe("halloween-duelist/ghost-wave");
	});

	it.each([
		"",
		"unknown",
		"Wave",
		"/wave",
		"pack/",
		"pack/a/b",
		"Pack/wave",
		"pack/Wave",
		"pack_one/wave",
		"-pack/wave",
		"pack-/wave",
		"pack--x/wave",
		"pack/a b",
		`pack/${"k".repeat(21)}`,
		`${"s".repeat(40)}/${"k".repeat(10)}`,
	])("rejects the malformed reference %p", (raw) => {
		expect(() => EmoteRef.parse(raw)).toThrow(`Invalid emote reference "${raw}"`);
	});

	it("accepts a key of exactly 20 characters", () => {
		expect(() => EmoteRef.parse(`pack/${"k".repeat(20)}`)).not.toThrow();
	});

	it("accepts a reference of exactly 48 bytes", () => {
		const raw = `${"s".repeat(27)}/${"k".repeat(20)}`;
		expect(raw.length).toBe(48);
		expect(() => EmoteRef.parse(raw)).not.toThrow();
	});
});
