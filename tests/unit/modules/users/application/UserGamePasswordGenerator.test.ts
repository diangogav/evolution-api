import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserGamePasswordGenerator } from "../../../../../src/modules/user/application/UserGamePasswordGenerator";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { Hash } from "../../../../../src/shared/Hash";
import { UserMother } from "../mothers/UserMother";

describe("UserGamePasswordGenerator", () => {
	let repository: UserRepository;
	let hash: Hash;
	let generator: UserGamePasswordGenerator;

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
		generator = new UserGamePasswordGenerator(repository, hash);
	});

	it("regenerates a 4-character game password, persists it and returns the plaintext once", async () => {
		const user = UserMother.create({ securePassword: "kept-account-password-hash" });
		spyOn(repository, "findById").mockResolvedValue(user);
		const updateSpy = spyOn(repository, "update");

		const result = await generator.generate({ userId: user.id });

		expect(result.gamePassword).toMatch(/^[a-zA-Z0-9]{4}$/);
		expect(updateSpy).toHaveBeenCalledTimes(1);

		const updatedUser = updateSpy.mock.calls[0][0] as User;
		expect(updatedUser.securePassword).toBe("kept-account-password-hash"); // account password untouched
		expect(updatedUser.password).not.toBe(user.password); // game password rotated
		expect(await hash.compare(result.gamePassword, updatedUser.password)).toBe(true); // returned plaintext matches stored hash
	});

	it("throws when the user does not exist", async () => {
		spyOn(repository, "findById").mockResolvedValue(null);

		expect(generator.generate({ userId: "missing-user-id" })).rejects.toThrow(NotFoundError);
	});
});
