import { describe, expect, it } from "bun:test";

import { HttpDiscordOAuthClient } from "../../../../../src/modules/auth/infrastructure/HttpDiscordOAuthClient";

const SETTINGS = {
	clientId: "client-id",
	clientSecret: "client-secret",
	redirectUri: "https://api.example.com/api/v1/auth/discord/callback",
};

type Call = { url: string; init?: RequestInit };

function fakeFetch(responses: Response[]): { calls: Call[]; fetchFn: typeof fetch } {
	const calls: Call[] = [];
	const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return responses.shift() as Response;
	}) as typeof fetch;
	return { calls, fetchFn };
}

describe("HttpDiscordOAuthClient", () => {
	it("builds the consent URL with the identity and email scopes", () => {
		const url = new URL(new HttpDiscordOAuthClient(SETTINGS).authorizeUrl("state-1"));

		expect(`${url.origin}${url.pathname}`).toBe("https://discord.com/oauth2/authorize");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			response_type: "code",
			client_id: "client-id",
			scope: "identify email",
			redirect_uri: SETTINGS.redirectUri,
			state: "state-1",
			prompt: "none",
		});
	});

	it("trades the code for a token and reads the identity with it", async () => {
		const { calls, fetchFn } = fakeFetch([
			Response.json({ access_token: "token-1" }),
			Response.json({
				id: "42",
				username: "duelist",
				global_name: "Duelist",
				email: "duelist@example.com",
				verified: true,
			}),
		]);

		const identity = await new HttpDiscordOAuthClient(SETTINGS, fetchFn).fetchIdentity("code-1");

		expect(identity).toEqual({
			id: "42",
			username: "duelist",
			globalName: "Duelist",
			email: "duelist@example.com",
			emailVerified: true,
		});
		expect(calls[0].url).toBe("https://discord.com/api/oauth2/token");
		expect(Object.fromEntries(calls[0].init?.body as URLSearchParams)).toEqual({
			client_id: "client-id",
			client_secret: "client-secret",
			grant_type: "authorization_code",
			code: "code-1",
			redirect_uri: SETTINGS.redirectUri,
		});
		expect(calls[1].url).toBe("https://discord.com/api/users/@me");
		expect(new Headers(calls[1].init?.headers).get("authorization")).toBe("Bearer token-1");
	});

	it("treats a missing email and an unverified one as not verified", async () => {
		const { fetchFn } = fakeFetch([
			Response.json({ access_token: "token-1" }),
			Response.json({ id: "42", username: "duelist", global_name: null }),
		]);

		const identity = await new HttpDiscordOAuthClient(SETTINGS, fetchFn).fetchIdentity("code-1");

		expect(identity).toMatchObject({ globalName: null, email: null, emailVerified: false });
	});

	it("rejects when Discord refuses the code", async () => {
		const { calls, fetchFn } = fakeFetch([new Response("invalid_grant", { status: 400 })]);

		await expect(
			new HttpDiscordOAuthClient(SETTINGS, fetchFn).fetchIdentity("used-code"),
		).rejects.toThrow("400");
		expect(calls).toHaveLength(1);
	});

	it("rejects a user response without an id", async () => {
		const { fetchFn } = fakeFetch([
			Response.json({ access_token: "token-1" }),
			Response.json({ username: "duelist" }),
		]);

		await expect(
			new HttpDiscordOAuthClient(SETTINGS, fetchFn).fetchIdentity("code-1"),
		).rejects.toThrow();
	});
});
