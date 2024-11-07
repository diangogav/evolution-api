import { beforeEach, describe, expect, it } from "bun:test";
import { mock, MockProxy } from "jest-mock-extended";

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
	let repository: MockProxy<UserRepository>;
	let hash: Hash;
	let logger: Logger;
	let emailSender: MockProxy<EmailSender>;
	let userRegister: UserRegister;
	let request: { id: string; email: string; username: string };

	beforeEach(() => {
		repository = mock<UserRepository>();
		hash = new Hash();
		logger = new Pino();
		emailSender = mock<EmailSender>();
		userRegister = new UserRegister(repository, hash, logger, emailSender);
		request = UserRegisterRequestMother.create();

		emailSender.send.mockResolvedValue();
		repository.findByEmailOrUsername.mockResolvedValue(null);
	});

	it("Should...", async () => {
		await userRegister.register(request);
		expect(repository.create).toHaveBeenCalledTimes(1);
		expect(emailSender.send).toHaveBeenCalledTimes(1);
	});

	it("Should...", async () => {
		repository.findByEmailOrUsername.mockResolvedValue(UserMother.create());
		expect(userRegister.register(request)).rejects.toThrow(
			new ConflictError(`User with email ${request.email} or username ${request.username} already exists`),
		);
	});
});
