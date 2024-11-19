import { beforeEach, describe, expect, it } from "bun:test";
import { mock, MockProxy } from "jest-mock-extended";

import { UserUsernameUpdater } from "../../../../../src/modules/user/application/UserUsernameUpdater";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { UserMother } from "../mothers/UserMother";
import { UserUsernameUpdaterRequestMother } from "../mothers/UserUsernameUpdaterRequestMother";

describe("User UsernameUpdater", () => {
	let repository: MockProxy<UserRepository>;
	let user: User;
	let userUsernameUpdater: UserUsernameUpdater;
	let request: { username: string; id: string };

	beforeEach(() => {
		repository = mock<UserRepository>();
		user = UserMother.create();
		repository.findById.mockResolvedValue(user);
		userUsernameUpdater = new UserUsernameUpdater(repository);
		request = UserUsernameUpdaterRequestMother.create({ id: user.id });
	});

	it("Should update user username correctly", async () => {
		await userUsernameUpdater.updateUsername(request);
		expect(repository.update).toHaveBeenCalledTimes(1);
		expect(user.username).toEqual(request.username);
		expect(repository.update).toHaveBeenCalledWith(
			expect.objectContaining({
				id: user.id,
				username: request.username,
			}),
		);
	});
});
