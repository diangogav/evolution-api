import { beforeEach, describe, expect, it } from "bun:test";

import { EmailVerificationLinks } from "../../../../../src/modules/user/application/EmailVerificationLinks";
import { EmailVerificationStatus } from "../../../../../src/modules/user/application/EmailVerificationStatus";
import { UserRegister } from "../../../../../src/modules/user/application/UserRegister";
import { VerifyEmail } from "../../../../../src/modules/user/application/VerifyEmail";
import { ResetPasswordLinkBuilder } from "../../../../../src/modules/user/domain/ResetPasswordLinkBuilder";
import type { User } from "../../../../../src/modules/user/domain/User";
import type { VerificationFacts } from "../../../../../src/modules/user/domain/VerifiedAccount";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { TooManyRequestsError } from "../../../../../src/shared/errors/TooManyRequestsError";
import { Hash } from "../../../../../src/shared/Hash";
import { JWT } from "../../../../../src/shared/JWT";
import { UserMother } from "../mothers/UserMother";

const NOW = new Date("2026-11-13T12:00:00Z");
const CUTOFF = new Date("2026-11-01T00:00:00Z");
const CONFIRM_COPY =
	"Confirm your email with the button below. You need a confirmed email or a linked Discord account to chat in rooms, play ranked and join tournaments. The link works for 24 hours.";
const FRONTEND = "https://evoduel.com";
const TEMPLATE = `${FRONTEND}/#/verify-email?token={token}`;

function tokenOf(url: string): string {
	return url.split("token=")[1];
}

describe("email verification", () => {
	let jwt: JWT;
	let links: EmailVerificationLinks;
	let user: User;
	let users: { findById: (id: string) => Promise<User | null> };
	let verified: Map<string, Date>;
	let accounts: Map<string, { discordId: string | null; createdAt: Date | null }>;
	let emailVerifications: {
		markVerified: (userId: string, at: Date) => Promise<void>;
		isVerified: (userId: string) => Promise<boolean>;
		verificationFacts: (userId: string) => Promise<VerificationFacts | null>;
	};

	beforeEach(() => {
		jwt = new JWT({ issuer: "issuer", secret: "secret" });
		links = new EmailVerificationLinks(
			jwt,
			new ResetPasswordLinkBuilder(
				[
					{ origin: FRONTEND, template: TEMPLATE },
					{
						origin: "http://localhost:5173",
						template: "http://localhost:5173/#/verify-email?token={token}",
					},
				],
				TEMPLATE,
			),
		);
		user = UserMother.create({ id: "user-1", username: "duelist", email: "duelist@example.com" });
		users = { findById: async (id) => (id === user.id ? user : null) };
		verified = new Map();
		accounts = new Map([["user-1", { discordId: null, createdAt: NOW }]]);
		emailVerifications = {
			markVerified: async (userId, at) => {
				if (!verified.has(userId)) verified.set(userId, at);
			},
			isVerified: async (userId) => verified.has(userId),
			verificationFacts: async (userId) => {
				const account = accounts.get(userId);
				if (!account) return null;
				return { ...account, emailVerifiedAt: verified.get(userId) ?? null };
			},
		};
	});

	describe("EmailVerificationLinks", () => {
		it("builds a link to the frontend that asked, carrying who and which address it proves", () => {
			const url = links.build({
				userId: "user-1",
				email: "duelist@example.com",
				origin: "http://localhost:5173",
			});

			expect(url).toStartWith("http://localhost:5173/#/verify-email?token=");
			expect(links.read(tokenOf(url))).toEqual({ userId: "user-1", email: "duelist@example.com" });
		});

		it("uses the default frontend for a request without a known origin", () => {
			const url = links.build({
				userId: "user-1",
				email: "x@example.com",
				origin: "https://evil.example",
			});

			expect(url).toStartWith(`${FRONTEND}/#/verify-email?token=`);
		});

		it("issues tokens that do not work as a session", () => {
			const token = tokenOf(links.build({ userId: "user-1", email: "x@example.com" }));

			expect(jwt.decode(token)).not.toHaveProperty("id");
		});

		it.each([
			["a session token", () => jwt.generate({ id: "user-1", role: "USER" })],
			["a password reset token", () => jwt.generate({ id: "user-1", purpose: "password-reset" })],
			[
				"a token signed with another key",
				() =>
					new JWT({ issuer: "issuer", secret: "other" }).generate({
						purpose: "email-verification",
						verifyUserId: "user-1",
						email: "x@example.com",
					}),
			],
			["nothing", () => ""],
		])("does not read %s as a verification link", (_label, make) => {
			expect(links.read(make())).toBeNull();
		});
	});

	describe("VerifyEmail", () => {
		let verify: VerifyEmail;

		beforeEach(() => {
			verify = new VerifyEmail(links, users, emailVerifications);
		});

		it("marks the address as verified for the user of the link", async () => {
			const token = tokenOf(links.build({ userId: user.id, email: user.email }));

			expect(await verify.run({ token, now: NOW })).toEqual({ verified: true });
			expect(verified.get("user-1")).toEqual(NOW);
		});

		it("can be opened twice", async () => {
			const token = tokenOf(links.build({ userId: user.id, email: user.email }));
			await verify.run({ token, now: NOW });

			expect(await verify.run({ token, now: new Date("2026-11-14T00:00:00Z") })).toEqual({
				verified: true,
			});
			expect(verified.get("user-1")).toEqual(NOW);
		});

		it("rejects a link mailed to an address the account no longer uses", async () => {
			const token = tokenOf(links.build({ userId: user.id, email: "old@example.com" }));

			await expect(verify.run({ token, now: NOW })).rejects.toThrow(AuthenticationError);
			expect(verified.size).toBe(0);
		});

		it.each([
			[
				"a link for a user that does not exist",
				() => tokenOf(links.build({ userId: "ghost", email: "g@example.com" })),
			],
			["a session token", () => jwt.generate({ id: "user-1", role: "USER" })],
			["garbage", () => "not-a-token"],
		])("rejects %s", async (_label, make) => {
			await expect(verify.run({ token: make(), now: NOW })).rejects.toThrow(AuthenticationError);
			expect(verified.size).toBe(0);
		});
	});

	describe("EmailVerificationStatus", () => {
		let sent: { to: string; data: Record<string, string> }[];
		let allowed: boolean;
		let attempts: string[];
		let status: EmailVerificationStatus;

		beforeEach(() => {
			sent = [];
			allowed = true;
			attempts = [];
			status = new EmailVerificationStatus(
				users,
				emailVerifications,
				links,
				{
					send: async (to, data) => {
						sent.push({ to, data });
					},
				},
				{
					allow: async (userId) => {
						attempts.push(userId);
						return allowed;
					},
				},
				CUTOFF,
			);
		});

		it("reports a new account without a confirmed email or Discord as not verified", async () => {
			expect(await status.get("user-1")).toEqual({ verified: false, accountVerified: false });
		});

		it("counts a confirmed email as a verified account", async () => {
			verified.set("user-1", NOW);

			expect(await status.get("user-1")).toEqual({ verified: true, accountVerified: true });
		});

		it("counts a linked Discord as a verified account while the email stays unconfirmed", async () => {
			accounts.set("user-1", { discordId: "discord-1", createdAt: NOW });

			expect(await status.get("user-1")).toEqual({ verified: false, accountVerified: true });
		});

		it("counts an account created before the cutoff as verified while the email stays unconfirmed", async () => {
			accounts.set("user-1", { discordId: null, createdAt: new Date("2026-10-01T00:00:00Z") });

			expect(await status.get("user-1")).toEqual({ verified: false, accountVerified: true });
		});

		it("reports nothing verified for a user that does not exist", async () => {
			expect(await status.get("ghost")).toEqual({ verified: false, accountVerified: false });
		});

		it("explains in the email what a confirmed address unlocks", async () => {
			await status.resend({ userId: "user-1" });

			expect(sent[0].data.text).toContain(CONFIRM_COPY);
			expect(sent[0].data.text).not.toContain("recover your account");
		});

		it("mails a working link to the account's address", async () => {
			const result = await status.resend({ userId: "user-1", origin: FRONTEND });

			expect(result).toEqual({ sent: true });
			expect(sent).toHaveLength(1);
			expect(sent[0].to).toBe("duelist@example.com");
			const token = /token=([\w.-]+)/.exec(sent[0].data.text)?.[1] ?? "";
			expect(links.read(token)).toEqual({ userId: "user-1", email: "duelist@example.com" });
		});

		it("sends nothing, and does not count an attempt, when the address is already verified", async () => {
			verified.set("user-1", NOW);

			expect(await status.resend({ userId: "user-1" })).toEqual({ sent: false });
			expect(sent).toEqual([]);
			expect(attempts).toEqual([]);
		});

		it("refuses a second email inside the waiting window", async () => {
			allowed = false;

			await expect(status.resend({ userId: "user-1" })).rejects.toThrow(TooManyRequestsError);
			expect(sent).toEqual([]);
		});

		it("answers not found for a user that does not exist", async () => {
			await expect(status.resend({ userId: "ghost" })).rejects.toThrow(NotFoundError);
		});
	});

	describe("UserRegister", () => {
		let sent: Record<string, string>[];
		const repository = {
			create: async () => undefined,
			findByEmailOrUsername: async () => null,
			findByEmail: async () => null,
			findByUsername: async () => null,
			isUsernameTaken: async () => false,
			findById: async () => null,
			update: async () => undefined,
		};
		const logger = { info: () => undefined, error: () => undefined } as never;

		function register(withLinks: boolean): UserRegister {
			sent = [];
			return new UserRegister(
				repository,
				new Hash(),
				logger,
				{
					send: async (_to, data) => {
						sent.push(data);
					},
				},
				jwt,
				withLinks ? links : undefined,
			);
		}

		const FORM = {
			id: "user-2",
			email: "new@example.com",
			username: "newbie",
			password: "Passw0rd!",
		};

		it("puts the confirmation link in the welcome email of an email registration", async () => {
			await register(true).register({ ...FORM, origin: "http://localhost:5173" });

			const token = /token=([\w.-]+)/.exec(sent[0].text)?.[1] ?? "";
			expect(sent[0].text).toContain("http://localhost:5173/#/verify-email?token=");
			expect(sent[0].text).toContain("Confirm my email");
			expect(links.read(token)).toEqual({ userId: "user-2", email: "new@example.com" });
		});

		it("explains in the welcome email what a confirmed address unlocks and keeps the dueling PIN advice", async () => {
			await register(true).register(FORM);

			expect(sent[0].text).toContain(CONFIRM_COPY);
			expect(sent[0].text).not.toContain("recover your account");
			expect(sent[0].text).toContain("generate your dueling PIN");
		});

		it("asks for no confirmation when Discord already verified the address", async () => {
			await register(true).register({
				...FORM,
				discord: { discordId: "discord-1", emailVerifiedAt: NOW },
			});

			expect(sent[0].text).not.toContain("verify-email");
			expect(sent[0].text).toContain("Open Evolution");
		});
	});
});
