import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserUsernameUpdater } from "../../../../../src/modules/user/application/UserUsernameUpdater";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { UserMother } from "../mothers/UserMother";
import { UserUsernameUpdaterRequestMother } from "../mothers/UserUsernameUpdaterRequestMother";

describe("User UsernameUpdater", () => {
	let repository: UserRepository;
	let user: User;
	let userUsernameUpdater: UserUsernameUpdater;
	let request: { username: string; id: string };

	beforeEach(() => {
		repository = {
			create: async () => undefined,
			findByEmailOrUsername: async () => null,
			findByEmail: async () => null,
			findById: async () => null,
			update: async () => undefined,
		}
		user = UserMother.create();
		spyOn(repository, "findById").mockResolvedValue(user);
		userUsernameUpdater = new UserUsernameUpdater(repository);
		request = UserUsernameUpdaterRequestMother.create({ id: user.id });
	});

	it("Should update user username correctly", async () => {
		const repositoryUpdateSpy = spyOn(repository, "update");
		await userUsernameUpdater.updateUsername(request);
		expect(repositoryUpdateSpy).toHaveBeenCalledTimes(1);
		expect(user.username).toEqual(request.username);
		expect(repositoryUpdateSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: user.id,
				username: request.username,
			}),
		);
	});
});
