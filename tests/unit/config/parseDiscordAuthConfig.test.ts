import { describe, expect, it } from "bun:test";

import { parseDiscordAuthConfig } from "../../../src/config";

const COMPLETE = {
	DISCORD_CLIENT_ID: "client-id",
	DISCORD_CLIENT_SECRET: "client-secret",
	DISCORD_REDIRECT_URI: "https://api.example.com/api/v1/auth/discord/callback",
};

describe("parseDiscordAuthConfig", () => {
	it("returns the credentials when all three variables are set", () => {
		expect(parseDiscordAuthConfig(COMPLETE)).toEqual({
			clientId: "client-id",
			clientSecret: "client-secret",
			redirectUri: "https://api.example.com/api/v1/auth/discord/callback",
		});
	});

	it.each(Object.keys(COMPLETE))("turns Discord sign-in off when %s is missing", (missing) => {
		expect(parseDiscordAuthConfig({ ...COMPLETE, [missing]: " " })).toBeNull();
	});

	it("turns Discord sign-in off when nothing is set", () => {
		expect(parseDiscordAuthConfig({})).toBeNull();
	});

	it("rejects a redirect URI that is not an http(s) URL", () => {
		expect(() =>
			parseDiscordAuthConfig({ ...COMPLETE, DISCORD_REDIRECT_URI: "api.example.com/callback" }),
		).toThrow("DISCORD_REDIRECT_URI");
	});
});
