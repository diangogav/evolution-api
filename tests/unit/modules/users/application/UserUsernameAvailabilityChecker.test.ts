import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserUsernameAvailabilityChecker } from "../../../../../src/modules/user/application/UserUsernameAvailabilityChecker";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { UserMother } from "../mothers/UserMother";

describe("UserUsernameAvailabilityChecker", () => {
	let repository: UserRepository;
	let checker: UserUsernameAvailabilityChecker;

	beforeEach(() => {
		repository = {
			create: async () => undefined,
			findByEmailOrUsername: async () => null,
			findByEmail: async () => null,
			findById: async () => null,
			findByUsername: async () => null,
			update: async () => undefined,
			updateParticipantId: async () => undefined,
			findByParticipantId: async () => null,
		};
		checker = new UserUsernameAvailabilityChecker(repository);
	});

	it("returns available true when no user owns the username", async () => {
		spyOn(repository, "findByUsername").mockResolvedValue(null);

		const result = await checker.check({ username: "free-name" });

		expect(result).toEqual({ available: true });
	});

	it("returns available false when the username is already taken", async () => {
		spyOn(repository, "findByUsername").mockResolvedValue(UserMother.create());

		const result = await checker.check({ username: "taken-name" });

		expect(result).toEqual({ available: false });
	});

	it("looks the username up through the repository", async () => {
		const findByUsernameSpy = spyOn(repository, "findByUsername");

		await checker.check({ username: "some-name" });

		expect(findByUsernameSpy).toHaveBeenCalledWith("some-name");
	});
});
