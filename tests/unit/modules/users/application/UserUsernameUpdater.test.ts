import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserUsernameUpdater } from "../../../../../src/modules/user/application/UserUsernameUpdater";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
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
			findByUsername: async () => null,
			findById: async () => null,
			update: async () => undefined,
			updateParticipantId: async () => undefined,
			findByParticipantId: async () => null,
		};
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

	it("throws a ConflictError when the username is already taken by another user", async () => {
		const anotherUser = UserMother.create();
		spyOn(repository, "findByUsername").mockResolvedValue(anotherUser);
		const repositoryUpdateSpy = spyOn(repository, "update");

		await expect(userUsernameUpdater.updateUsername(request)).rejects.toThrow(ConflictError);
		expect(repositoryUpdateSpy).not.toHaveBeenCalled();
	});

	it("allows a user to keep their own username without conflict", async () => {
		spyOn(repository, "findByUsername").mockResolvedValue(user);
		const repositoryUpdateSpy = spyOn(repository, "update");

		await userUsernameUpdater.updateUsername({ id: user.id, username: user.username });

		expect(repositoryUpdateSpy).toHaveBeenCalledTimes(1);
	});
});
