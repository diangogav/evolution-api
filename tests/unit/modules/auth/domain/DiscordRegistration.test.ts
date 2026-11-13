import { describe, expect, it } from "bun:test";

import { suggestUsername } from "../../../../../src/modules/auth/domain/DiscordRegistration";

describe("suggestUsername", () => {
	it("offers the Discord username when it fits", () => {
		expect(suggestUsername({ username: "duelist", globalName: "The Duelist" })).toBe("duelist");
	});

	it("cuts a name longer than ours allows to 14 characters", () => {
		expect(suggestUsername({ username: "averyveryverylongname", globalName: null })).toBe(
			"averyveryveryl",
		);
	});

	it("removes spaces", () => {
		expect(suggestUsername({ username: " dark magician ", globalName: null })).toBe("darkmagician");
	});

	it("falls back to the display name, then to nothing", () => {
		expect(suggestUsername({ username: "   ", globalName: "Kaiba" })).toBe("Kaiba");
		expect(suggestUsername({ username: "", globalName: null })).toBe("");
	});
});
