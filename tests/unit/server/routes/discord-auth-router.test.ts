import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { AdmitDiscordIdentity } from "../../../../src/modules/auth/application/AdmitDiscordIdentity";
import { CompleteDiscordLogin } from "../../../../src/modules/auth/application/CompleteDiscordLogin";
import { DiscordLinkIntent } from "../../../../src/modules/auth/application/DiscordLinkIntent";
import { DiscordLoginState } from "../../../../src/modules/auth/application/DiscordLoginState";
import { ExchangeLoginCode } from "../../../../src/modules/auth/application/ExchangeLoginCode";
import { LinkDiscordToUser } from "../../../../src/modules/auth/application/LinkDiscordToUser";
import { ManageDiscordLink } from "../../../../src/modules/auth/application/ManageDiscordLink";
import { RegisterWithDiscord } from "../../../../src/modules/auth/application/RegisterWithDiscord";
import { StartDiscordLogin } from "../../../../src/modules/auth/application/StartDiscordLogin";
import type { EmailAccount } from "../../../../src/modules/auth/domain/DiscordAccounts";
import type { DiscordRegistration } from "../../../../src/modules/auth/domain/DiscordRegistration";
import { DiscordReturnLinkBuilder } from "../../../../src/modules/auth/domain/DiscordReturnLinkBuilder";
import { UserRegister } from "../../../../src/modules/user/application/UserRegister";
import type { User } from "../../../../src/modules/user/domain/User";
import type { VerifiedDiscordIdentity } from "../../../../src/modules/user/domain/UserRepository";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import { createDiscordAuthRouter } from "../../../../src/server/routes/discord-auth-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { Hash } from "../../../../src/shared/Hash";
import { JWT } from "../../../../src/shared/JWT";
import { UserMother } from "../../modules/users/mothers/UserMother";

const FRONTEND = "https://evoduel.com";
const BASE = "http://localhost/auth/discord";

type World = {
	configured?: boolean;
	secureCookie?: boolean;
	/** Users that exist before the sign-in, with the Discord account linked to each. */
	users?: { user: User; discordId: string | null }[];
};

function buildApp({ configured = true, secureCookie = true, users = [] }: World = {}) {
	const jwt = new JWT({ issuer: "issuer", secret: "secret" });
	const state = new DiscordLoginState(jwt);
	const links = new DiscordReturnLinkBuilder([
		{ origin: FRONTEND, template: `${FRONTEND}/#/auth/discord?{query}` },
	]);
	const rows = users.map((row) => ({ ...row }));
	const created: { user: User; discord?: VerifiedDiscordIdentity }[] = [];
	const emails: string[] = [];

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
	const tickets = new Map<string, DiscordRegistration>();
	const registrations = {
		save: async (registration: DiscordRegistration) => {
			tickets.set("ticket-1", registration);
			return "ticket-1";
		},
		find: async (ticket: string) => tickets.get(ticket) ?? null,
		remove: async (ticket: string) => {
			tickets.delete(ticket);
		},
	};
	const oauthClient = {
		authorizeUrl: (value: string) => `https://discord.test/authorize?state=${value}`,
		fetchIdentity: async () => ({
			id: "discord-1",
			username: "duelist",
			globalName: null,
			email: "duelist@example.com",
			emailVerified: true,
		}),
	};
	const accounts = {
		findByDiscordId: async (discordId: string) => {
			const row = rows.find((candidate) => candidate.discordId === discordId);
			return row ? { id: row.user.id } : null;
		},
		findByEmail: async (email: string): Promise<EmailAccount[]> =>
			rows
				.filter((row) => row.user.email.toLowerCase() === email.toLowerCase())
				.map((row) => ({
					id: row.user.id,
					username: row.user.username,
					email: row.user.email,
					discordId: row.discordId,
					deleted: false,
				})),
		link: async (userId: string, discordId: string) => {
			const row = rows.find((candidate) => candidate.user.id === userId);
			if (!row || row.discordId) return false;
			row.discordId = discordId;
			return true;
		},
		findLinkStatus: async (userId: string) => {
			const row = rows.find((candidate) => candidate.user.id === userId);
			return row
				? {
						discordId: row.discordId,
						email: row.user.email,
						hasPassword: row.user.securePassword !== null,
					}
				: null;
		},
		unlink: async (userId: string) => {
			const row = rows.find((candidate) => candidate.user.id === userId);
			if (row) row.discordId = null;
		},
	};
	const intents = new DiscordLinkIntent(jwt);
	const userRepository = {
		create: async (user: User, discord?: VerifiedDiscordIdentity) => {
			created.push({ user, discord });
			rows.push({ user, discordId: discord?.discordId ?? null });
		},
		findByEmailOrUsername: async (email: string, username: string) =>
			rows.find((row) => row.user.email === email || row.user.username === username)?.user ?? null,
		findByEmail: async () => null,
		findByUsername: async () => null,
		findById: async (id: string) => rows.find((row) => row.user.id === id)?.user ?? null,
		update: async () => undefined,
	};
	const emailSender = {
		send: async (to: string) => {
			emails.push(to);
		},
	};
	const logger = { info: () => undefined, error: () => undefined } as never;
	let nonces = 0;

	const router = createDiscordAuthRouter({
		secureCookie,
		// The bearer token is the user id, so a test signs in by naming the user.
		requireUser: createRequireUser({
			jwt: { decode: (token) => ({ id: token }) },
			activeBans: { execute: async () => null },
		}),
		useCases: configured
			? {
					start: new StartDiscordLogin(
						oauthClient,
						state,
						links,
						() => `nonce-${++nonces}`,
						intents,
					),
					complete: new CompleteDiscordLogin(
						oauthClient,
						new AdmitDiscordIdentity(accounts, registrations, emailSender, logger),
						loginCodes,
						state,
						links,
						logger,
						new LinkDiscordToUser(accounts),
					),
					link: new ManageDiscordLink(accounts, intents, `${BASE}/start`),
					exchange: new ExchangeLoginCode(loginCodes, userRepository, jwt),
					register: new RegisterWithDiscord(
						registrations,
						new UserRegister(userRepository, new Hash(), logger, emailSender, jwt),
					),
				}
			: null,
	});

	return {
		app: new Elysia().onError(mapDomainErrorStatus).use(router),
		jwt,
		rows,
		created,
		emails,
	};
}

const LINKED = {
	user: UserMother.create({ id: "user-1", username: "duelist" }),
	discordId: "discord-1",
};

function post(app: { handle(request: Request): Promise<Response> }, path: string, body: unknown) {
	return app.handle(
		new Request(`${BASE}${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
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
		const { app, jwt } = buildApp({ users: [LINKED] });
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

	it("links the account that has the same email and signs its owner in", async () => {
		const existing = UserMother.create({ id: "user-7", email: "Duelist@example.com" });
		const { app, rows, emails } = buildApp({ users: [{ user: existing, discordId: null }] });
		const { state, cookie } = await start(app as unknown as Elysia);

		const callback = await app.handle(
			new Request(`${BASE}/callback?code=discord-code&state=${state}`, { headers: { cookie } }),
		);

		expect(callback.headers.get("location")).toBe(
			`${FRONTEND}/#/auth/discord?code=login-code&redirect=%2F`,
		);
		expect(rows[0].discordId).toBe("discord-1");
		expect(emails).toEqual(["Duelist@example.com"]);

		const session = await post(app, "/session", { code: "login-code" });
		expect(((await session.json()) as { id: string }).id).toBe("user-7");
	});

	it("registers a new user end to end: callback ticket, then username and password", async () => {
		const { app, jwt, created } = buildApp();
		const { state, cookie } = await start(app as unknown as Elysia, "?redirect=/decks");

		const callback = await app.handle(
			new Request(`${BASE}/callback?code=discord-code&state=${state}`, { headers: { cookie } }),
		);

		expect(callback.headers.get("location")).toBe(
			`${FRONTEND}/#/auth/discord?register=ticket-1&username=duelist&redirect=%2Fdecks`,
		);

		const weak = await post(app, "/register", {
			ticket: "ticket-1",
			username: "duelist",
			password: "short",
		});
		expect(weak.status).toBe(400);

		const registered = await post(app, "/register", {
			ticket: "ticket-1",
			username: "duelist",
			password: "Passw0rd!",
		});

		expect(registered.status).toBe(200);
		const body = (await registered.json()) as { id: string; token: string; gamePassword: string };
		expect(body).toMatchObject({ username: "duelist", email: "duelist@example.com" });
		expect(body.gamePassword).toHaveLength(4);
		expect(jwt.decode(body.token)).toMatchObject({ id: body.id });
		expect(created).toHaveLength(1);
		expect(created[0].discord?.discordId).toBe("discord-1");
		expect(created[0].discord?.emailVerifiedAt).toBeInstanceOf(Date);
		expect(created[0].user.securePassword).toBeTruthy();

		const again = await post(app, "/register", {
			ticket: "ticket-1",
			username: "other",
			password: "Passw0rd!",
		});
		expect(again.status).toBe(401);
	});

	it("answers 409 to a registration whose username is taken and keeps the ticket", async () => {
		const taken = UserMother.create({ id: "user-3", username: "duelist", email: "x@example.com" });
		const { app } = buildApp({ users: [{ user: taken, discordId: null }] });
		const { state, cookie } = await start(app as unknown as Elysia);
		await app.handle(
			new Request(`${BASE}/callback?code=discord-code&state=${state}`, { headers: { cookie } }),
		);

		const conflict = await post(app, "/register", {
			ticket: "ticket-1",
			username: "duelist",
			password: "Passw0rd!",
		});
		const retry = await post(app, "/register", {
			ticket: "ticket-1",
			username: "duelist2",
			password: "Passw0rd!",
		});

		expect(conflict.status).toBe(409);
		expect(retry.status).toBe(200);
	});

	describe("linking from settings", () => {
		const PASSWORDLESS = UserMother.create({ id: "user-8", email: "p@example.com" });
		const WITH_PASSWORD = UserMother.create({
			id: "user-9",
			email: "other@example.com",
			securePassword: "hashed",
		});
		const as = (userId: string) => ({ authorization: `Bearer ${userId}` });

		it("links Discord to the signed-in user end to end and then reports it as linked", async () => {
			const { app, rows } = buildApp({ users: [{ user: WITH_PASSWORD, discordId: null }] });

			const begin = await app.handle(
				new Request(`${BASE}/link`, {
					method: "POST",
					headers: { ...as("user-9"), "content-type": "application/json" },
					body: JSON.stringify({ origin: FRONTEND, redirect: "/settings" }),
				}),
			);
			const { url } = (await begin.json()) as { url: string };
			const started = await app.handle(new Request(url));
			const state = (started.headers.get("location") ?? "").split("state=")[1];
			const cookie = (started.headers.get("set-cookie") ?? "").split(";")[0];
			const callback = await app.handle(
				new Request(`${BASE}/callback?code=discord-code&state=${state}`, { headers: { cookie } }),
			);

			expect(begin.status).toBe(200);
			expect(callback.headers.get("location")).toBe(
				`${FRONTEND}/#/auth/discord?linked=true&redirect=%2Fsettings`,
			);
			expect(rows[0].discordId).toBe("discord-1");

			const status = await app.handle(new Request(`${BASE}/link`, { headers: as("user-9") }));
			expect(await status.json()).toEqual({ linked: true, canUnlink: true });
		});

		it("unlinks a user who has a password", async () => {
			const { app, rows } = buildApp({ users: [{ user: WITH_PASSWORD, discordId: "discord-1" }] });

			const response = await app.handle(
				new Request(`${BASE}/link`, { method: "DELETE", headers: as("user-9") }),
			);

			expect(response.status).toBe(204);
			expect(rows[0].discordId).toBeNull();
		});

		it("answers 409 to unlinking a user who has no account password", async () => {
			const { app, rows } = buildApp({ users: [{ user: PASSWORDLESS, discordId: "discord-1" }] });

			const response = await app.handle(
				new Request(`${BASE}/link`, { method: "DELETE", headers: as("user-8") }),
			);

			expect(response.status).toBe(409);
			expect(rows[0].discordId).toBe("discord-1");
		});

		it.each([
			["GET", undefined],
			["POST", "{}"],
			["DELETE", undefined],
		])("answers 401 to %s /link without a session", async (method, body) => {
			const { app } = buildApp();

			const response = await app.handle(
				new Request(`${BASE}/link`, {
					method,
					headers: { "content-type": "application/json" },
					body,
				}),
			);

			expect(response.status).toBe(401);
		});
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
		["POST", "/register"],
	])("answers 404 to %s %s while Discord sign-in is not configured", async (method, path) => {
		const { app } = buildApp({ configured: false });

		const response = await app.handle(
			new Request(`${BASE}${path}`, {
				method,
				headers: { "content-type": "application/json" },
				body:
					method === "POST"
						? JSON.stringify({ code: "x", ticket: "t", username: "u", password: "Passw0rd!" })
						: undefined,
			}),
		);

		expect(response.status).toBe(404);
	});
});
