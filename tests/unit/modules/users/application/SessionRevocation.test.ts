import { beforeEach, describe, expect, it } from "bun:test";

import { ConfirmEmailChange } from "../../../../../src/modules/user/application/ConfirmEmailChange";
import { EmailChangeLinks } from "../../../../../src/modules/user/application/EmailChangeLinks";
import { UserAccountPasswordReset } from "../../../../../src/modules/user/application/UserAccountPasswordReset";
import { UserAccountPasswordUpdater } from "../../../../../src/modules/user/application/UserAccountPasswordUpdater";
import { UserUpgradePassword } from "../../../../../src/modules/user/application/UserUpgradePassword";
import { ResetPasswordLinkBuilder } from "../../../../../src/modules/user/domain/ResetPasswordLinkBuilder";
import type { User } from "../../../../../src/modules/user/domain/User";
import type { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { Hash } from "../../../../../src/shared/Hash";
import { JWT } from "../../../../../src/shared/JWT";
import { UserMother } from "../mothers/UserMother";

const NOW = new Date("2026-11-13T12:00:00Z");

/**
 * Changing what proves who the user is must end every sign-in made before it.
 * Each case checks the revocation happens on success and only on success.
 */
describe("ending sign-ins when credentials change", () => {
	const hash = new Hash();
	const jwt = new JWT({ issuer: "issuer", secret: "secret" });
	const emailSender = { send: async () => undefined };
	const logger = { info: () => undefined, error: () => undefined } as never;
	let revoked: { userId: string; now: Date }[];
	let sessions: { revokeAllForUser: (userId: string, now: Date) => Promise<void> };

	function repositoryWith(user: User): UserRepository {
		return {
			create: async () => undefined,
			findByEmailOrUsername: async () => null,
			findByEmail: async () => null,
			findByUsername: async () => null,
			findById: async (id) => (id === user.id ? user : null),
			update: async () => undefined,
		};
	}

	beforeEach(() => {
		revoked = [];
		sessions = {
			revokeAllForUser: async (userId, now) => {
				revoked.push({ userId, now });
			},
		};
	});

	describe("changing the account password", () => {
		async function updater() {
			const user = UserMother.create({
				id: "user-1",
				securePassword: await hash.hash("OldPassw0rd"),
			});
			return new UserAccountPasswordUpdater(
				repositoryWith(user),
				hash,
				logger,
				emailSender,
				sessions,
			);
		}

		it("ends every sign-in of the user", async () => {
			await (await updater()).updatePassword({
				id: "user-1",
				currentPassword: "OldPassw0rd",
				newPassword: "NewPassw0rd",
				now: NOW,
			});

			expect(revoked).toEqual([{ userId: "user-1", now: NOW }]);
		});

		it("ends nothing when the current password is wrong", async () => {
			await expect(
				(await updater()).updatePassword({
					id: "user-1",
					currentPassword: "nope",
					newPassword: "NewPassw0rd",
				}),
			).rejects.toThrow(AuthenticationError);
			expect(revoked).toEqual([]);
		});

		it("ends nothing when the new password is rejected", async () => {
			await expect(
				(await updater()).updatePassword({
					id: "user-1",
					currentPassword: "OldPassw0rd",
					newPassword: "weak",
				}),
			).rejects.toThrow(InvalidArgumentError);
			expect(revoked).toEqual([]);
		});
	});

	describe("resetting the account password", () => {
		const user = UserMother.create({ id: "user-1", securePassword: "old-hash" });
		const reset = () =>
			new UserAccountPasswordReset(
				repositoryWith(user),
				hash,
				emailSender,
				logger,
				jwt,
				undefined,
				sessions,
			);

		it("ends every sign-in of the user", async () => {
			await reset().resetPassword({
				token: jwt.generate({ id: "user-1", purpose: "password-reset" }),
				newPassword: "NewPassw0rd",
				now: NOW,
			});

			expect(revoked).toEqual([{ userId: "user-1", now: NOW }]);
		});

		it("ends nothing when the token is not a reset token", async () => {
			await expect(
				reset().resetPassword({
					token: jwt.generate({ id: "user-1", role: "USER" }),
					newPassword: "NewPassw0rd",
				}),
			).rejects.toThrow(AuthenticationError);
			expect(revoked).toEqual([]);
		});
	});

	describe("setting the first account password", () => {
		it("ends the sign-ins made with the game password", async () => {
			const user = UserMother.create({ id: "user-1", securePassword: null });

			await new UserUpgradePassword(repositoryWith(user), hash, jwt, sessions).upgrade({
				userId: "user-1",
				password: "NewPassw0rd",
				now: NOW,
			});

			expect(revoked).toEqual([{ userId: "user-1", now: NOW }]);
		});

		it("ends nothing for a user who already has an account password", async () => {
			const user = UserMother.create({ id: "user-1", securePassword: "hash" });

			await expect(
				new UserUpgradePassword(repositoryWith(user), hash, jwt, sessions).upgrade({
					userId: "user-1",
					password: "NewPassw0rd",
				}),
			).rejects.toThrow(ConflictError);
			expect(revoked).toEqual([]);
		});
	});

	describe("changing the email address", () => {
		const links = new EmailChangeLinks(
			jwt,
			new ResetPasswordLinkBuilder([], "https://evoduel.com/#/confirm-email-change?token={token}"),
		);
		const user = UserMother.create({ id: "user-1", email: "old@example.com" });
		const tokenFor = (newEmail: string) =>
			links
				.build({ userId: "user-1", currentEmail: "old@example.com", newEmail })
				.split("token=")[1];

		function confirm(changed: boolean) {
			return new ConfirmEmailChange(
				links,
				repositoryWith(user),
				{ isEmailInUse: async () => false, changeEmail: async () => changed },
				emailSender,
				logger,
				sessions,
			);
		}

		it("ends every sign-in of the user once the address has moved", async () => {
			await confirm(true).run({ token: tokenFor("new@example.com"), now: NOW });

			expect(revoked).toEqual([{ userId: "user-1", now: NOW }]);
		});

		it("ends nothing when the link turns out to be stale", async () => {
			await expect(
				confirm(false).run({ token: tokenFor("new@example.com"), now: NOW }),
			).rejects.toThrow(AuthenticationError);
			expect(revoked).toEqual([]);
		});
	});
});
