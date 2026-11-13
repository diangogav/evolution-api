import { describe, expect, it } from "bun:test";

import {
	DiscordReturnLinkBuilder,
	sanitizeReturnPath,
} from "../../../../../src/modules/auth/domain/DiscordReturnLinkBuilder";

const builder = new DiscordReturnLinkBuilder([
	{ origin: "https://evoduel.com", template: "https://evoduel.com/#/auth/discord?{query}" },
	{ origin: "http://localhost:5173", template: "http://localhost:5173/#/auth/discord?{query}" },
]);

describe("DiscordReturnLinkBuilder", () => {
	it("returns to the frontend that started the sign-in", () => {
		const url = builder.build("http://localhost:5173", { code: "abc", redirect: "/decks" });

		expect(url).toBe("http://localhost:5173/#/auth/discord?code=abc&redirect=%2Fdecks");
	});

	it("matches the origin ignoring case and a trailing slash", () => {
		expect(builder.resolveOrigin("HTTP://LOCALHOST:5173/")).toBe("http://localhost:5173");
	});

	it("falls back to the first frontend for an origin that is not registered", () => {
		const url = builder.build("https://evil.example", { error: "not_linked" });

		expect(url).toBe("https://evoduel.com/#/auth/discord?error=not_linked");
	});

	it("falls back to the first frontend when no origin is given", () => {
		expect(builder.resolveOrigin(null)).toBe("https://evoduel.com");
	});

	it("refuses an empty registry", () => {
		expect(() => new DiscordReturnLinkBuilder([])).toThrow();
	});
});

describe("sanitizeReturnPath", () => {
	it("keeps a plain absolute path", () => {
		expect(sanitizeReturnPath("/history?tab=ranked")).toBe("/history?tab=ranked");
	});

	it.each([
		["a missing value", undefined],
		["a full URL", "https://evil.example/"],
		["a protocol-relative URL", "//evil.example"],
		["a backslash", "/\\evil.example"],
		["a control character", "/decks\n"],
		["a path over the length limit", `/${"a".repeat(600)}`],
	])("falls back to the home page for %s", (_label, value) => {
		expect(sanitizeReturnPath(value)).toBe("/");
	});
});
