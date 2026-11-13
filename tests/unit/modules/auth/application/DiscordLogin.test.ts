import { beforeEach, describe, expect, it } from "bun:test";

import type { DiscordAdmission } from "../../../../../src/modules/auth/application/AdmitDiscordIdentity";
import { CompleteDiscordLogin } from "../../../../../src/modules/auth/application/CompleteDiscordLogin";
import { DiscordLoginState } from "../../../../../src/modules/auth/application/DiscordLoginState";
import { ExchangeLoginCode } from "../../../../../src/modules/auth/application/ExchangeLoginCode";
import { StartDiscordLogin } from "../../../../../src/modules/auth/application/StartDiscordLogin";
import type { DiscordIdentity } from "../../../../../src/modules/auth/domain/DiscordIdentity";
import { DiscordReturnLinkBuilder } from "../../../../../src/modules/auth/domain/DiscordReturnLinkBuilder";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { JWT } from "../../../../../src/shared/JWT";
import { UserMother } from "../../users/mothers/UserMother";

const DEFAULT_ORIGIN = "https://evoduel.com";
const LOCAL_ORIGIN = "http://localhost:5173";

const NOW = new Date("2026-11-13T12:00:00Z");

const IDENTITY: DiscordIdentity = {
	id: "discord-1",
	username: "duelist",
	globalName: "Duelist",
	email: "duelist@example.com",
	emailVerified: true,
};

class FakeLoginCodes {
	readonly issued = new Map<string, string>();
	private next = 1;

	async issue(userId: string): Promise<string> {
		const code = `code-${this.next++}`;
		this.issued.set(code, userId);
		return code;
	}

	async consume(code: string): Promise<string | null> {
		const userId = this.issued.get(code) ?? null;
		this.issued.delete(code);
		return userId;
	}
}

function resultOf(redirectUrl: string): URLSearchParams {
	return new URLSearchParams(redirectUrl.split("?")[1]);
}

describe("signing in with Discord", () => {
	let jwt: JWT;
	let state: DiscordLoginState;
	let links: DiscordReturnLinkBuilder;
	let loginCodes: FakeLoginCodes;
	let admission: DiscordAdmission;
	let admitted: DiscordIdentity[];
	let identityRequests: string[];
	let failIdentity: boolean;
	let start: StartDiscordLogin;
	let complete: CompleteDiscordLogin;

	beforeEach(() => {
		jwt = new JWT({ issuer: "issuer", secret: "secret" });
		state = new DiscordLoginState(jwt);
		links = new DiscordReturnLinkBuilder([
			{ origin: DEFAULT_ORIGIN, template: `${DEFAULT_ORIGIN}/#/auth/discord?{query}` },
			{ origin: LOCAL_ORIGIN, template: `${LOCAL_ORIGIN}/#/auth/discord?{query}` },
		]);
		loginCodes = new FakeLoginCodes();
		admission = { kind: "login", userId: "user-1" };
		admitted = [];
		identityRequests = [];
		failIdentity = false;

		const oauthClient = {
			authorizeUrl: (value: string) => `https://discord.test/authorize?state=${value}`,
			fetchIdentity: async (code: string) => {
				identityRequests.push(code);
				if (failIdentity) throw new Error("Discord answered 400 to the token request");
				return IDENTITY;
			},
		};
		const admit = {
			run: async (identity: DiscordIdentity) => {
				admitted.push(identity);
				return admission;
			},
		};
		const logger = { info: () => undefined, error: () => undefined } as never;

		start = new StartDiscordLogin(oauthClient, state, links, () => "nonce-1");
		complete = new CompleteDiscordLogin(oauthClient, admit, loginCodes, state, links, logger);
	});

	function startedState(input: { origin?: string; redirect?: string } = {}): string {
		const { authorizeUrl } = start.run(input);
		return authorizeUrl.split("state=")[1];
	}

	describe("StartDiscordLogin", () => {
		it("sends the browser to Discord with a state bound to the nonce it returns", () => {
			const { authorizeUrl, nonce } = start.run({ origin: LOCAL_ORIGIN, redirect: "/decks" });

			const payload = state.read(authorizeUrl.split("state=")[1]);
			expect(nonce).toBe("nonce-1");
			expect(payload).toMatchObject({ origin: LOCAL_ORIGIN, redirect: "/decks" });
			expect(payload && state.matchesNonce(payload, "nonce-1")).toBe(true);
			expect(payload && state.matchesNonce(payload, "another-nonce")).toBe(false);
		});

		it("stores the default frontend and the home page for values it does not accept", () => {
			const payload = state.read(
				startedState({ origin: "https://evil.example", redirect: "//evil" }),
			);

			expect(payload).toMatchObject({ origin: DEFAULT_ORIGIN, redirect: "/" });
		});
	});

	describe("CompleteDiscordLogin", () => {
		it("returns a login code for the user the identity is admitted as", async () => {
			const { redirectUrl } = await complete.run({
				now: NOW,
				code: "discord-code",
				state: startedState({ origin: LOCAL_ORIGIN, redirect: "/decks" }),
				nonce: "nonce-1",
			});

			const result = resultOf(redirectUrl);
			expect(redirectUrl.startsWith(`${LOCAL_ORIGIN}/#/auth/discord?`)).toBe(true);
			expect(result.get("redirect")).toBe("/decks");
			expect(loginCodes.issued.get(result.get("code") as string)).toBe("user-1");
			expect(identityRequests).toEqual(["discord-code"]);
			expect(admitted).toEqual([IDENTITY]);
		});

		it("returns the registration ticket and the suggested username for a new user", async () => {
			admission = { kind: "register", ticket: "ticket-1", username: "duelist" };

			const { redirectUrl } = await complete.run({
				now: NOW,
				code: "discord-code",
				state: startedState({ redirect: "/decks" }),
				nonce: "nonce-1",
			});

			expect(Object.fromEntries(resultOf(redirectUrl))).toEqual({
				register: "ticket-1",
				username: "duelist",
				redirect: "/decks",
			});
			expect(loginCodes.issued.size).toBe(0);
		});

		it("reports the reason when the identity is not admitted", async () => {
			admission = { kind: "error", error: "account_conflict" };

			const { redirectUrl } = await complete.run({
				now: NOW,
				code: "discord-code",
				state: startedState(),
				nonce: "nonce-1",
			});

			expect(resultOf(redirectUrl).get("error")).toBe("account_conflict");
			expect(loginCodes.issued.size).toBe(0);
		});

		it("rejects a callback from a browser that did not start the sign-in", async () => {
			const { redirectUrl } = await complete.run({
				now: NOW,
				code: "discord-code",
				state: startedState({ origin: LOCAL_ORIGIN }),
				nonce: "nonce-of-another-browser",
			});

			expect(resultOf(redirectUrl).get("error")).toBe("invalid_state");
			expect(identityRequests).toEqual([]);
		});

		it("rejects a callback without the nonce cookie", async () => {
			const { redirectUrl } = await complete.run({
				code: "discord-code",
				state: startedState(),
				now: NOW,
			});

			expect(resultOf(redirectUrl).get("error")).toBe("invalid_state");
		});

		it("sends a state it did not sign to the default frontend", async () => {
			const forged = new JWT({ issuer: "issuer", secret: "another-secret" }).generate({
				purpose: "discord-login",
				origin: LOCAL_ORIGIN,
				redirect: "/",
				nonceHash: "x",
			});

			const { redirectUrl } = await complete.run({
				code: "c",
				state: forged,
				nonce: "nonce-1",
				now: NOW,
			});

			expect(redirectUrl).toBe(`${DEFAULT_ORIGIN}/#/auth/discord?error=invalid_state`);
		});

		it("does not accept a session token as a state", async () => {
			const sessionToken = jwt.generate({ id: "user-1", role: "USER" });

			const { redirectUrl } = await complete.run({
				now: NOW,
				code: "c",
				state: sessionToken,
				nonce: "nonce-1",
			});

			expect(resultOf(redirectUrl).get("error")).toBe("invalid_state");
		});

		it("reports access_denied when the user declines on Discord", async () => {
			const { redirectUrl } = await complete.run({
				now: NOW,
				error: "access_denied",
				state: startedState(),
				nonce: "nonce-1",
			});

			expect(resultOf(redirectUrl).get("error")).toBe("access_denied");
			expect(identityRequests).toEqual([]);
		});

		it("reports discord_unavailable when Discord refuses the code", async () => {
			failIdentity = true;

			const { redirectUrl } = await complete.run({
				now: NOW,
				code: "discord-code",
				state: startedState(),
				nonce: "nonce-1",
			});

			expect(resultOf(redirectUrl).get("error")).toBe("discord_unavailable");
			expect(loginCodes.issued.size).toBe(0);
		});
	});

	describe("ExchangeLoginCode", () => {
		const user = UserMother.create({ id: "user-1", username: "duelist" });
		let exchange: ExchangeLoginCode;

		beforeEach(() => {
			const users = { findById: async (id: string) => (id === user.id ? user : null) };
			exchange = new ExchangeLoginCode(loginCodes, users, jwt);
		});

		it("returns a session for the user behind the code", async () => {
			const code = await loginCodes.issue(user.id);

			const session = await exchange.run({ code });

			expect(session).toMatchObject({ id: "user-1", username: "duelist", mustUpgrade: false });
			expect(jwt.decode(session.token)).toMatchObject({ id: "user-1", role: user.role });
		});

		it("accepts a code only once", async () => {
			const code = await loginCodes.issue(user.id);
			await exchange.run({ code });

			await expect(exchange.run({ code })).rejects.toThrow(AuthenticationError);
		});

		it("rejects an unknown code", async () => {
			await expect(exchange.run({ code: "nope" })).rejects.toThrow(AuthenticationError);
		});

		it("rejects a code whose user no longer exists", async () => {
			const code = await loginCodes.issue("deleted-user");

			await expect(exchange.run({ code })).rejects.toThrow(AuthenticationError);
		});
	});
});
