import { beforeEach, describe, expect, it } from "bun:test";

import { ConfirmEmailChange } from "../../../../../src/modules/user/application/ConfirmEmailChange";
import { EmailChangeLinks } from "../../../../../src/modules/user/application/EmailChangeLinks";
import { RequestEmailChange } from "../../../../../src/modules/user/application/RequestEmailChange";
import {
	type EmailChanges,
	EmailTakenError,
	normalizeNewEmail,
} from "../../../../../src/modules/user/domain/EmailChanges";
import { ResetPasswordLinkBuilder } from "../../../../../src/modules/user/domain/ResetPasswordLinkBuilder";
import type { User } from "../../../../../src/modules/user/domain/User";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { TooManyRequestsError } from "../../../../../src/shared/errors/TooManyRequestsError";
import { JWT } from "../../../../../src/shared/JWT";
import { UserMother } from "../mothers/UserMother";

const NOW = new Date("2026-11-13T12:00:00Z");
const TEMPLATE = "https://evoduel.com/#/confirm-email-change?token={token}";

type Mail = { to: string; data: Record<string, string> };

/** Users keyed by id; an email change rewrites the stored user like the database would. */
class World implements EmailChanges {
	users = new Map<string, User>();
	verifiedAt = new Map<string, Date>();
	/** Simulates another account taking the address between the check and the write. */
	takenAtWrite = false;

	add(user: User): User {
		this.users.set(user.id, user);
		return user;
	}

	findById = async (id: string) => this.users.get(id) ?? null;

	async isEmailInUse(email: string) {
		return [...this.users.values()].some(
			(user) => user.email.toLowerCase() === email.toLowerCase(),
		);
	}

	async changeEmail(input: {
		userId: string;
		currentEmail: string;
		newEmail: string;
		verifiedAt: Date;
	}) {
		if (this.takenAtWrite) throw new EmailTakenError();
		const user = this.users.get(input.userId);
		if (!user || user.email !== input.currentEmail) return false;
		this.users.set(
			user.id,
			UserMother.create({ ...user, username: user.username, email: input.newEmail }),
		);
		this.verifiedAt.set(user.id, input.verifiedAt);
		return true;
	}
}

describe("changing the email address", () => {
	let jwt: JWT;
	let links: EmailChangeLinks;
	let world: World;
	let sent: Mail[];
	let failMail: boolean;
	let user: User;
	const emailSender = {
		send: async (to: string, data: Record<string, string>) => {
			if (failMail) throw new Error("mail provider down");
			sent.push({ to, data });
		},
	};
	const logger = { info: () => undefined, error: () => undefined } as never;

	beforeEach(() => {
		jwt = new JWT({ issuer: "issuer", secret: "secret" });
		links = new EmailChangeLinks(jwt, new ResetPasswordLinkBuilder([], TEMPLATE));
		world = new World();
		sent = [];
		failMail = false;
		user = world.add(
			UserMother.create({
				id: "user-1",
				username: "duelist",
				email: "old@example.com",
				securePassword: "hash:Passw0rd!",
			}),
		);
	});

	function tokenIn(mail: Mail): string {
		return /token=([\w.-]+)/.exec(mail.data.text)?.[1] ?? "";
	}

	describe("RequestEmailChange", () => {
		let allowed: boolean;
		let request: RequestEmailChange;
		const FORM = { userId: "user-1", newEmail: " new@example.com ", currentPassword: "Passw0rd!" };

		beforeEach(() => {
			allowed = true;
			request = new RequestEmailChange(
				world,
				world,
				{ compare: async (plain, hashed) => hashed === `hash:${plain}` },
				links,
				emailSender,
				{ allow: async () => allowed },
			);
		});

		it("mails a confirmation link to the new address and leaves the account as it is", async () => {
			expect(await request.run(FORM)).toEqual({ sent: true });

			expect(sent).toHaveLength(1);
			expect(sent[0].to).toBe("new@example.com");
			expect(links.read(tokenIn(sent[0]))).toEqual({
				userId: "user-1",
				currentEmail: "old@example.com",
				newEmail: "new@example.com",
			});
			expect(world.users.get("user-1")?.email).toBe("old@example.com");
		});

		it("refuses a wrong current password before looking at the address", async () => {
			await expect(
				request.run({ ...FORM, currentPassword: "nope", newEmail: "bad" }),
			).rejects.toThrow(AuthenticationError);
			expect(sent).toEqual([]);
		});

		it("refuses an account that has no account password", async () => {
			world.add(
				UserMother.create({ id: "user-2", email: "pin@example.com", securePassword: null }),
			);

			await expect(request.run({ ...FORM, userId: "user-2" })).rejects.toThrow(AuthenticationError);
		});

		it.each([
			["is not an address", "not-an-email"],
			["is the address the account already has, in another case", "OLD@example.com"],
		])("refuses an address that %s", async (_label, newEmail) => {
			await expect(request.run({ ...FORM, newEmail })).rejects.toThrow(InvalidArgumentError);
			expect(sent).toEqual([]);
		});

		it("refuses an address another account uses, ignoring case", async () => {
			world.add(UserMother.create({ id: "user-3", email: "Taken@example.com" }));

			await expect(request.run({ ...FORM, newEmail: "taken@example.com" })).rejects.toThrow(
				ConflictError,
			);
			expect(sent).toEqual([]);
		});

		it("refuses a second request inside the waiting window", async () => {
			allowed = false;

			await expect(request.run(FORM)).rejects.toThrow(TooManyRequestsError);
			expect(sent).toEqual([]);
		});

		it("answers not found for a user that does not exist", async () => {
			await expect(request.run({ ...FORM, userId: "ghost" })).rejects.toThrow(NotFoundError);
		});
	});

	describe("ConfirmEmailChange", () => {
		let confirm: ConfirmEmailChange;

		function linkFor(
			overrides: { currentEmail?: string; newEmail?: string; userId?: string } = {},
		): string {
			const url = links.build({
				userId: "user-1",
				currentEmail: "old@example.com",
				newEmail: "new@example.com",
				...overrides,
			});
			return url.split("token=")[1];
		}

		beforeEach(() => {
			confirm = new ConfirmEmailChange(links, world, world, emailSender, logger);
		});

		it("moves the account to the new address, marks it verified and tells the previous one", async () => {
			expect(await confirm.run({ token: linkFor(), now: NOW })).toEqual({
				email: "new@example.com",
			});

			expect(world.users.get("user-1")?.email).toBe("new@example.com");
			expect(world.verifiedAt.get("user-1")).toEqual(NOW);
			expect(sent).toHaveLength(1);
			expect(sent[0].to).toBe("old@example.com");
			expect(sent[0].data.text).toContain("new@example.com");
		});

		it("still applies the change when the notice to the previous address cannot be sent", async () => {
			failMail = true;

			expect(await confirm.run({ token: linkFor(), now: NOW })).toEqual({
				email: "new@example.com",
			});
			expect(world.users.get("user-1")?.email).toBe("new@example.com");
		});

		it("works only once: the same link is stale after the change", async () => {
			const token = linkFor();
			await confirm.run({ token, now: NOW });

			await expect(confirm.run({ token, now: NOW })).rejects.toThrow(AuthenticationError);
			expect(sent).toHaveLength(1);
		});

		it("rejects a link requested before the account moved to another address", async () => {
			const older = linkFor({ newEmail: "first@example.com" });
			await confirm.run({ token: linkFor({ newEmail: "second@example.com" }), now: NOW });

			await expect(confirm.run({ token: older, now: NOW })).rejects.toThrow(AuthenticationError);
			expect(world.users.get("user-1")?.email).toBe("second@example.com");
		});

		it("answers a conflict when another account took the address after the request", async () => {
			const token = linkFor();
			world.add(UserMother.create({ id: "user-4", email: "new@example.com" }));

			await expect(confirm.run({ token, now: NOW })).rejects.toThrow(ConflictError);
			expect(world.users.get("user-1")?.email).toBe("old@example.com");
		});

		it("answers a conflict when the address is taken between the check and the write", async () => {
			world.takenAtWrite = true;

			await expect(confirm.run({ token: linkFor(), now: NOW })).rejects.toThrow(ConflictError);
			expect(sent).toEqual([]);
		});

		it.each([
			["a session token", () => jwt.generate({ id: "user-1", role: "USER" })],
			[
				"an email verification link",
				() =>
					jwt.generate({
						purpose: "email-verification",
						verifyUserId: "user-1",
						email: "old@example.com",
					}),
			],
			["a link for a user that does not exist", () => linkFor({ userId: "ghost" })],
			["garbage", () => "not-a-token"],
		])("rejects %s", async (_label, make) => {
			await expect(confirm.run({ token: make(), now: NOW })).rejects.toThrow(AuthenticationError);
			expect(world.users.get("user-1")?.email).toBe("old@example.com");
		});

		it("issues links that do not work as a session", () => {
			expect(jwt.decode(linkFor())).not.toHaveProperty("id");
		});
	});
});

describe("normalizeNewEmail", () => {
	it("trims a valid address", () => {
		expect(normalizeNewEmail("  duelist@example.com ")).toBe("duelist@example.com");
	});

	it.each([
		"",
		"no-at-sign",
		"two@@example.com",
		"spaces in@example.com",
		"no-domain@",
		"@no-user.com",
		"no-dot@example",
		`${"a".repeat(250)}@example.com`,
	])("rejects %p", (value) => {
		expect(normalizeNewEmail(value)).toBeNull();
	});
});
