import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { CompleteDiscordLogin } from "../../../../src/modules/auth/application/CompleteDiscordLogin";
import { DiscordLoginState } from "../../../../src/modules/auth/application/DiscordLoginState";
import { ExchangeLoginCode } from "../../../../src/modules/auth/application/ExchangeLoginCode";
import { StartDiscordLogin } from "../../../../src/modules/auth/application/StartDiscordLogin";
import { DiscordReturnLinkBuilder } from "../../../../src/modules/auth/domain/DiscordReturnLinkBuilder";
import { createDiscordAuthRouter } from "../../../../src/server/routes/discord-auth-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { JWT } from "../../../../src/shared/JWT";
import { UserMother } from "../../modules/users/mothers/UserMother";

const FRONTEND = "https://evoduel.com";
const BASE = "http://localhost/auth/discord";

function buildApp({ configured = true, secureCookie = true } = {}) {
	const jwt = new JWT({ issuer: "issuer", secret: "secret" });
	const state = new DiscordLoginState(jwt);
	const links = new DiscordReturnLinkBuilder([
		{ origin: FRONTEND, template: `${FRONTEND}/#/auth/discord?{query}` },
	]);
	const user = UserMother.create({ id: "user-1", username: "duelist" });
	const codes = new Map<string, string>();
	const loginCodes = {
		issue: async (userId: string) => {
			codes.set("login-code", userId);
			return "login-code";
		},
		consume: async (code: string) => {
			const userId = codes.get(code) ?? null;
			codes.delete(code);
			return userId;
		},
	};
	const oauthClient = {
		authorizeUrl: (value: string) => `https://discord.test/authorize?state=${value}`,
		fetchIdentity: async () => ({
			id: "discord-1",
			username: "duelist",
			globalName: null,
			email: null,
			emailVerified: false,
		}),
	};
	const accounts = { findByDiscordId: async () => ({ id: user.id }) };
	const logger = { info: () => undefined, error: () => undefined } as never;
	let nonces = 0;

	const router = createDiscordAuthRouter({
		secureCookie,
		useCases: configured
			? {
					start: new StartDiscordLogin(oauthClient, state, links, () => `nonce-${++nonces}`),
					complete: new CompleteDiscordLogin(
						oauthClient,
						accounts,
						loginCodes,
						state,
						links,
						logger,
					),
					exchange: new ExchangeLoginCode(
						loginCodes,
						{ findById: async (id) => (id === user.id ? user : null) },
						jwt,
					),
				}
			: null,
	});

	return { app: new Elysia().onError(mapDomainErrorStatus).use(router), jwt };
}

/** Starts a sign-in and returns what the browser would keep: the state and the cookie. */
async function start(app: Elysia, query = "") {
	const response = await app.handle(new Request(`${BASE}/start${query}`));
	const location = response.headers.get("location") ?? "";
	const setCookie = response.headers.get("set-cookie") ?? "";
	return {
		response,
		setCookie,
		state: location.split("state=")[1],
		cookie: setCookie.split(";")[0],
	};
}

describe("discord auth router", () => {
	it("redirects to Discord and sets the nonce cookie for the callback path only", async () => {
		const { app } = buildApp();

		const { response, setCookie, state } = await start(app as unknown as Elysia);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toStartWith("https://discord.test/authorize?state=");
		expect(state).toBeTruthy();
		expect(setCookie).toStartWith("discord_login_nonce=nonce-1");
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("Secure");
		expect(setCookie).toContain("SameSite=Lax");
		expect(setCookie).toContain("Path=/api/v1/auth/discord");
		expect(setCookie).toContain("Max-Age=600");
	});

	it("leaves the cookie without Secure when asked to, for plain-http development", async () => {
		const { app } = buildApp({ secureCookie: false });

		const { setCookie } = await start(app as unknown as Elysia);

		expect(setCookie).not.toContain("Secure");
	});

	it("signs a browser in end to end: start, callback, then the code for a session", async () => {
		const { app, jwt } = buildApp();
		const { state, cookie } = await start(app as unknown as Elysia, "?redirect=/decks");

		const callback = await app.handle(
			new Request(`${BASE}/callback?code=discord-code&state=${state}`, { headers: { cookie } }),
		);

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe(
			`${FRONTEND}/#/auth/discord?code=login-code&redirect=%2Fdecks`,
		);
		expect(callback.headers.get("set-cookie")).toContain("Max-Age=0");

		const session = await app.handle(
			new Request(`${BASE}/session`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ code: "login-code" }),
			}),
		);

		expect(session.status).toBe(200);
		const body = (await session.json()) as { id: string; token: string; username: string };
		expect(body).toMatchObject({ id: "user-1", username: "duelist", mustUpgrade: false });
		expect(jwt.decode(body.token)).toMatchObject({ id: "user-1" });

		const replay = await app.handle(
			new Request(`${BASE}/session`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ code: "login-code" }),
			}),
		);
		expect(replay.status).toBe(401);
	});

	it("sends a callback without the cookie back with invalid_state", async () => {
		const { app } = buildApp();
		const { state } = await start(app as unknown as Elysia);

		const callback = await app.handle(new Request(`${BASE}/callback?code=c&state=${state}`));

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe(`${FRONTEND}/#/auth/discord?error=invalid_state`);
	});

	it("rejects a session request without a code", async () => {
		const { app } = buildApp();

		const response = await app.handle(
			new Request(`${BASE}/session`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		);

		expect(response.status).toBe(422);
	});

	it.each([
		["GET", "/start"],
		["GET", "/callback?code=c&state=s"],
		["POST", "/session"],
	])("answers 404 to %s %s while Discord sign-in is not configured", async (method, path) => {
		const { app } = buildApp({ configured: false });

		const response = await app.handle(
			new Request(`${BASE}${path}`, {
				method,
				headers: { "content-type": "application/json" },
				body: method === "POST" ? JSON.stringify({ code: "x" }) : undefined,
			}),
		);

		expect(response.status).toBe(404);
	});
});
