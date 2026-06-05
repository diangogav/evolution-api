import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserAccountPasswordUpdater } from "../../../../../src/modules/user/application/UserAccountPasswordUpdater";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { EmailSender } from "../../../../../src/shared/email/domain/EmailSender";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { Hash } from "../../../../../src/shared/Hash";
import { Logger } from "../../../../../src/shared/logger/domain/Logger";
import { Pino } from "../../../../../src/shared/logger/infrastructure/Pino";
import { UserMother } from "../mothers/UserMother";

describe("UserAccountPasswordUpdater", () => {
	let repository: UserRepository;
	let hash: Hash;
	let logger: Logger;
	let emailSender: EmailSender;
	let updater: UserAccountPasswordUpdater;
	let migratedUser: User;

	const currentPassword = "CurrentPass1";

	beforeEach(async () => {
		repository = {
			create: async () => undefined,
			findByEmailOrUsername: async () => null,
			findByEmail: async () => null,
			findById: async () => null,
			update: async () => undefined,
			updateParticipantId: async () => undefined,
			findByParticipantId: async () => null,
		};
		hash = new Hash();
		logger = new Pino();
		emailSender = { send: async () => undefined };
		updater = new UserAccountPasswordUpdater(repository, hash, logger, emailSender);

		migratedUser = UserMother.create({ securePassword: await hash.hash(currentPassword) });
		spyOn(emailSender, "send").mockResolvedValue();
	});

	it("changes the account password when the current one is correct", async () => {
		spyOn(repository, "findById").mockResolvedValue(migratedUser);
		const updateSpy = spyOn(repository, "update");
		const emailSpy = spyOn(emailSender, "send");

		await updater.updatePassword({ id: migratedUser.id, currentPassword, newPassword: "NewPass2024" });

		expect(updateSpy).toHaveBeenCalledTimes(1);
		const updatedUser = updateSpy.mock.calls[0][0] as User;
		expect(await hash.compare("NewPass2024", updatedUser.securePassword as string)).toBe(true);
		expect(emailSpy).toHaveBeenCalledTimes(1);
	});

	it("rejects when the current password is wrong", async () => {
		spyOn(repository, "findById").mockResolvedValue(migratedUser);

		expect(
			updater.updatePassword({ id: migratedUser.id, currentPassword: "WrongPass9", newPassword: "NewPass2024" }),
		).rejects.toThrow(AuthenticationError);
	});

	it("rejects when the user has no account password yet", async () => {
		const unmigrated = UserMother.create({ securePassword: null });
		spyOn(repository, "findById").mockResolvedValue(unmigrated);

		expect(
			updater.updatePassword({ id: unmigrated.id, currentPassword: "whatever1", newPassword: "NewPass2024" }),
		).rejects.toThrow(AuthenticationError);
	});

	it("rejects a weak new password", async () => {
		spyOn(repository, "findById").mockResolvedValue(migratedUser);

		expect(
			updater.updatePassword({ id: migratedUser.id, currentPassword, newPassword: "weak" }),
		).rejects.toThrow(InvalidArgumentError);
	});

	it("throws when the user does not exist", async () => {
		spyOn(repository, "findById").mockResolvedValue(null);

		expect(
			updater.updatePassword({ id: "missing-user-id", currentPassword, newPassword: "NewPass2024" }),
		).rejects.toThrow(NotFoundError);
	});
});
