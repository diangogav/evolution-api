import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserUsernameAvailabilityChecker } from "../../../../../src/modules/user/application/UserUsernameAvailabilityChecker";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";

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
			isUsernameTaken: async () => false,
			update: async () => undefined,
		};
		checker = new UserUsernameAvailabilityChecker(repository);
	});

	it("returns available true when no user owns the username", async () => {
		spyOn(repository, "isUsernameTaken").mockResolvedValue(false);

		const result = await checker.check({ username: "free-name" });

		expect(result).toEqual({ available: true });
	});

	it("returns available false when the username is already taken", async () => {
		spyOn(repository, "isUsernameTaken").mockResolvedValue(true);

		const result = await checker.check({ username: "taken-name" });

		expect(result).toEqual({ available: false });
	});

	it("looks the username up against every account, ignoring letter case", async () => {
		const takenSpy = spyOn(repository, "isUsernameTaken");

		await checker.check({ username: "some-name" });

		expect(takenSpy).toHaveBeenCalledWith("some-name");
	});
});
