import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserRegister } from "../../../../../src/modules/user/application/UserRegister";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { EmailSender } from "../../../../../src/shared/email/domain/EmailSender";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { Hash } from "../../../../../src/shared/Hash";
import { Logger } from "../../../../../src/shared/logger/domain/Logger";
import { Pino } from "../../../../../src/shared/logger/infrastructure/Pino";
import { UserMother } from "../mothers/UserMother";
import { UserRegisterRequestMother } from "../mothers/UserRegisterRequestMother";

describe("UserRegister", () => {
	let repository: UserRepository;
	let hash: Hash;
	let logger: Logger;
	let emailSender: EmailSender;
	let userRegister: UserRegister;
	let request: { id: string; email: string; username: string };

	beforeEach(() => {
		repository = {
			create: async () => undefined,
			findByEmailOrUsername: async () => null,
			findByEmail: async () => null,
			findById: async () => null,
			update: async () => undefined,
		}
		hash = new Hash();
		logger = new Pino();
		emailSender = {
			send: async () => undefined
		}
		userRegister = new UserRegister(repository, hash, logger, emailSender);
		request = UserRegisterRequestMother.create();

		spyOn(emailSender, "send").mockResolvedValue();
		spyOn(repository, "findByEmailOrUsername").mockResolvedValue(null);
	});

	it("Should register an user correctly", async () => {
		const repositoryCreateSpy = spyOn(repository, "create");
		const emailSenderSendSpy = spyOn(emailSender, "send");
		await userRegister.register(request);
		expect(repositoryCreateSpy).toHaveBeenCalledTimes(1);
		expect(emailSenderSendSpy).toHaveBeenCalledTimes(1);
	});

	it("Should should error if user register already exists", async () => {
		spyOn(repository, "findByEmailOrUsername").mockResolvedValue(UserMother.create());
		expect(userRegister.register(request)).rejects.toThrow(
			new ConflictError(`User with email ${request.email} or username ${request.username} already exists`),
		);
	});
});
