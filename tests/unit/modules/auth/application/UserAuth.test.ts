import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mock, MockProxy } from "jest-mock-extended";

import { UserAuth } from "../../../../../src/modules/auth/application/UserAuth";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { Hash } from "../../../../../src/shared/Hash";
import { JWT } from "../../../../../src/shared/JWT";
import { UserAuthRequestMother } from "../../users/mothers/UserAuthRequestMother";
import { UserMother } from "../../users/mothers/UserMother";

describe("UserAuth", () => {
	let userAuth: UserAuth;
	let repository: MockProxy<UserRepository>;
	let hash: Hash;
	let jwt: JWT;
	let user: User;
	let request: { email: string; password: string };

	beforeEach(async () => {
		hash = new Hash();
		jwt = new JWT({ issuer: "issuer", secret: "secret" });
		repository = mock<UserRepository>();
		userAuth = new UserAuth(repository, hash, jwt);
		request = UserAuthRequestMother.create();
		const hashedPassword = await hash.hash(request.password);
		user = UserMother.create({ password: hashedPassword, email: request.email });
	});

	it("Should login success if data is correct", async () => {
		repository.findByEmail.mockResolvedValue(user);
		const response = await userAuth.login(request);
		expect(repository.findByEmail).toHaveBeenCalledTimes(1);
		expect(repository.findByEmail).toHaveBeenCalledWith(request.email);
		expect(response).toContainAllKeys(["token", "username", "id"]);
		expect(response.username).toBe(user.username);
	});

	it("Should throw a AuthenticationError if user does not exit", async () => {
		spyOn(repository, "findByEmail").mockResolvedValue(null);
		expect(userAuth.login(request)).rejects.toThrowError(new AuthenticationError("Wrong email or password"));
	});

	it("Should throw an AuthenticationError if email or password", async () => {
		spyOn(repository, "findByEmail").mockResolvedValue(user);
		request.password = "InvalidPassword";
		expect(userAuth.login(request)).rejects.toThrowError(new AuthenticationError("Wrong email or password"));
	});
});
