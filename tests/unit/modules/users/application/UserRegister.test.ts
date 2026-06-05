import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserRegister } from "../../../../../src/modules/user/application/UserRegister";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { EmailSender } from "../../../../../src/shared/email/domain/EmailSender";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { Hash } from "../../../../../src/shared/Hash";
import { JWT } from "../../../../../src/shared/JWT";
import { Logger } from "../../../../../src/shared/logger/domain/Logger";
import { Pino } from "../../../../../src/shared/logger/infrastructure/Pino";
import { UserMother } from "../mothers/UserMother";
import { UserRegisterRequestMother } from "../mothers/UserRegisterRequestMother";

describe("UserRegister", () => {
	let repository: UserRepository;
	let hash: Hash;
	let logger: Logger;
	let emailSender: EmailSender;
	let jwt: JWT;
	let userRegister: UserRegister;
	let request: { id: string; email: string; username: string };

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
		logger = new Pino();
		emailSender = {
			send: async () => undefined,
		};
		jwt = new JWT({ issuer: "evolution", secret: "test-secret" });
		userRegister = new UserRegister(repository, hash, logger, emailSender, jwt);
		request = UserRegisterRequestMother.create();

		spyOn(emailSender, "send").mockResolvedValue();
		spyOn(repository, "findByEmailOrUsername").mockResolvedValue(null);
	});

	it("registers a user with only a game password when no account password is provided", async () => {
		const repositoryCreateSpy = spyOn(repository, "create");
		const emailSenderSendSpy = spyOn(emailSender, "send");

		const result = await userRegister.register(request);

		expect(repositoryCreateSpy).toHaveBeenCalledTimes(1);
		expect(emailSenderSendSpy).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ id: request.id, username: request.username, email: request.email });

		const createdUser = repositoryCreateSpy.mock.calls[0][0] as User;
		expect(createdUser.securePassword).toBeNull();
	});

	it("registers a new user with a chosen strong password and returns a token", async () => {
		const repositoryCreateSpy = spyOn(repository, "create");

		const result = (await userRegister.register({ ...request, password: "yugi2024" })) as { token: string };

		const createdUser = repositoryCreateSpy.mock.calls[0][0] as User;
		expect(typeof createdUser.securePassword).toBe("string");
		expect(createdUser.securePassword).not.toBe("yugi2024"); // stored hashed, never plaintext
		expect(typeof createdUser.password).toBe("string"); // 4-char game password still provisioned
		expect(typeof result.token).toBe("string");
		expect(result.token.length).toBeGreaterThan(0);
	});

	it("does not email the plaintext password on the strong-password flow", async () => {
		const emailSenderSendSpy = spyOn(emailSender, "send");

		await userRegister.register({ ...request, password: "yugi2024" });

		const emailData = emailSenderSendSpy.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(emailData?.password).toBeUndefined();
		expect(JSON.stringify(emailData ?? {})).not.toContain("yugi2024");
	});

	it("rejects a weak password that does not meet the policy", async () => {
		expect(userRegister.register({ ...request, password: "weak" })).rejects.toThrow(InvalidArgumentError);
	});

	it("errors if the user already exists", async () => {
		spyOn(repository, "findByEmailOrUsername").mockResolvedValue(UserMother.create());
		expect(userRegister.register(request)).rejects.toThrow(
			new ConflictError(`User with email ${request.email} or username ${request.username} already exists`),
		);
	});
});
