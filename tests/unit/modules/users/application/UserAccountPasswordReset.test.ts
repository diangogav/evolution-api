import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserAccountPasswordReset } from "../../../../../src/modules/user/application/UserAccountPasswordReset";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { EmailSender } from "../../../../../src/shared/email/domain/EmailSender";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { Hash } from "../../../../../src/shared/Hash";
import { JWT } from "../../../../../src/shared/JWT";
import { Logger } from "../../../../../src/shared/logger/domain/Logger";
import { Pino } from "../../../../../src/shared/logger/infrastructure/Pino";
import { UserMother } from "../mothers/UserMother";

describe("UserAccountPasswordReset", () => {
	let repository: UserRepository;
	let hash: Hash;
	let emailSender: EmailSender;
	let logger: Logger;
	let jwt: JWT;
	let reset: UserAccountPasswordReset;
	let user: User;
	let token: string;

	beforeEach(() => {
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
		emailSender = { send: async () => undefined };
		logger = new Pino();
		jwt = new JWT({ issuer: "issuer", secret: "secret" });
		reset = new UserAccountPasswordReset(repository, hash, emailSender, logger, jwt);

		user = UserMother.create({ securePassword: null });
		token = jwt.generate({ id: user.id });
		spyOn(emailSender, "send").mockResolvedValue();
	});

	it("resets the account password with a valid token", async () => {
		spyOn(repository, "findById").mockResolvedValue(user);
		const updateSpy = spyOn(repository, "update");

		await reset.resetPassword({ token, newPassword: "NewPass2024" });

		expect(updateSpy).toHaveBeenCalledTimes(1);
		const updatedUser = updateSpy.mock.calls[0][0] as User;
		expect(await hash.compare("NewPass2024", updatedUser.securePassword as string)).toBe(true);
	});

	it("throws when no token is provided", async () => {
		expect(reset.resetPassword({ token: "", newPassword: "NewPass2024" })).rejects.toThrow(AuthenticationError);
	});

	it("throws when the token is invalid", async () => {
		expect(reset.resetPassword({ token: "not-a-valid-token", newPassword: "NewPass2024" })).rejects.toThrow(
			AuthenticationError,
		);
	});

	it("rejects a weak new password", async () => {
		spyOn(repository, "findById").mockResolvedValue(user);

		expect(reset.resetPassword({ token, newPassword: "weak" })).rejects.toThrow(InvalidArgumentError);
	});

	it("throws when the user does not exist", async () => {
		spyOn(repository, "findById").mockResolvedValue(null);

		expect(reset.resetPassword({ token, newPassword: "NewPass2024" })).rejects.toThrow(NotFoundError);
	});
});
