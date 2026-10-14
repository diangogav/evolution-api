import { describe, expect, it } from "bun:test";

import { activeEmotePacksBySlug } from "../../../../../src/modules/emote-bar/application/activeEmotePacks";
import { pack } from "./fixtures";

describe("activeEmotePacksBySlug", () => {
	it("keys a pack by the slug in its folder, with or without a trailing slash", () => {
		const withSlash = pack({ id: "a", assetRef: "emote-packs/halloween/" });
		const withoutSlash = pack({ id: "b", assetRef: "emote-packs/winter" });

		const bySlug = activeEmotePacksBySlug([withSlash, withoutSlash]);

		expect(bySlug.get("halloween")).toBe(withSlash);
		expect(bySlug.get("winter")).toBe(withoutSlash);
	});

	it.each([
		"emote-packs/",
		"emote-packs//",
		"emote-packs/a/b/",
		"emote-packs/a/b",
		"playmats/x/",
	])("ignores the asset ref %s", (assetRef) => {
		const bySlug = activeEmotePacksBySlug([pack({ assetRef })]);

		expect(bySlug.size).toBe(0);
	});

	it("ignores inactive packs", () => {
		expect(activeEmotePacksBySlug([pack({ active: false })]).size).toBe(0);
	});
});
