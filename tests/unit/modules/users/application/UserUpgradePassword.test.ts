import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserUpgradePassword } from "../../../../../src/modules/user/application/UserUpgradePassword";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { Hash } from "../../../../../src/shared/Hash";
import { JWT } from "../../../../../src/shared/JWT";
import { UserMother } from "../mothers/UserMother";

describe("UserUpgradePassword", () => {
	let repository: UserRepository;
	let hash: Hash;
	let jwt: JWT;
	let upgrader: UserUpgradePassword;

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
		jwt = new JWT({ issuer: "issuer", secret: "secret" });
		upgrader = new UserUpgradePassword(repository, hash, jwt);
	});

	it("sets the account password for a user that has not migrated yet and returns a token", async () => {
		const user = UserMother.create({ securePassword: null });
		spyOn(repository, "findById").mockResolvedValue(user);
		const updateSpy = spyOn(repository, "update");

		const result = await upgrader.upgrade({ userId: user.id, password: "yugi2024" });

		expect(updateSpy).toHaveBeenCalledTimes(1);
		const updatedUser = updateSpy.mock.calls[0][0] as User;
		expect(updatedUser.securePassword).not.toBeNull();
		expect(await hash.compare("yugi2024", updatedUser.securePassword as string)).toBe(true);
		expect(typeof result.token).toBe("string");
		expect(result.token.length).toBeGreaterThan(0);
	});

	it("rejects the upgrade when the user already has an account password", async () => {
		const migratedUser = UserMother.create({ securePassword: "already-an-account-password-hash" });
		spyOn(repository, "findById").mockResolvedValue(migratedUser);
		const updateSpy = spyOn(repository, "update");

		expect(upgrader.upgrade({ userId: migratedUser.id, password: "yugi2024" })).rejects.toThrow(ConflictError);
		expect(updateSpy).not.toHaveBeenCalled();
	});

	it("rejects a weak account password", async () => {
		const user = UserMother.create({ securePassword: null });
		spyOn(repository, "findById").mockResolvedValue(user);

		expect(upgrader.upgrade({ userId: user.id, password: "weak" })).rejects.toThrow(InvalidArgumentError);
	});

	it("throws when the user does not exist", async () => {
		spyOn(repository, "findById").mockResolvedValue(null);

		expect(upgrader.upgrade({ userId: "missing-user-id", password: "yugi2024" })).rejects.toThrow(NotFoundError);
	});
});
