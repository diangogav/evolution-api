import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserUsernameUpdater } from "../../../../../src/modules/user/application/UserUsernameUpdater";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { UsernameChangeRepository } from "../../../../../src/modules/user/domain/UsernameChange";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { TooManyRequestsError } from "../../../../../src/shared/errors/TooManyRequestsError";
import { UserMother } from "../mothers/UserMother";
import { UserUsernameUpdaterRequestMother } from "../mothers/UserUsernameUpdaterRequestMother";

const NOW = new Date("2026-11-24T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("User UsernameUpdater", () => {
	let repository: UserRepository;
	let usernameChanges: UsernameChangeRepository;
	let user: User;
	let userUsernameUpdater: UserUsernameUpdater;
	let request: { username: string; id: string; now: Date };

	beforeEach(() => {
		repository = {
			create: async () => undefined,
			findByEmailOrUsername: async () => null,
			findByEmail: async () => null,
			findByUsername: async () => null,
			isUsernameTaken: async () => false,
			findById: async () => null,
			update: async () => undefined,
		};
		usernameChanges = {
			lastChangeAt: async () => null,
			record: async () => undefined,
		};
		user = UserMother.create({ username: "OldName" });
		spyOn(repository, "findById").mockResolvedValue(user);
		userUsernameUpdater = new UserUsernameUpdater(repository, usernameChanges);
		request = {
			...UserUsernameUpdaterRequestMother.create({ id: user.id, username: "NewName" }),
			now: NOW,
		};
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
		spyOn(repository, "isUsernameTaken").mockResolvedValue(true);
		const repositoryUpdateSpy = spyOn(repository, "update");

		await expect(userUsernameUpdater.updateUsername(request)).rejects.toThrow(ConflictError);
		expect(repositoryUpdateSpy).not.toHaveBeenCalled();
	});

	it("checks the name against every other account, excluding the caller", async () => {
		const takenSpy = spyOn(repository, "isUsernameTaken");

		await userUsernameUpdater.updateUsername(request);

		expect(takenSpy).toHaveBeenCalledWith(request.username, user.id);
	});

	it("allows a user to keep their own username without conflict", async () => {
		const repositoryUpdateSpy = spyOn(repository, "update");
		const recordSpy = spyOn(usernameChanges, "record");

		await userUsernameUpdater.updateUsername({ id: user.id, username: user.username, now: NOW });

		expect(repositoryUpdateSpy).toHaveBeenCalledTimes(1);
		expect(recordSpy).not.toHaveBeenCalled();
	});

	it("keeps the current name even when another account holds it in a different letter case", async () => {
		spyOn(repository, "isUsernameTaken").mockResolvedValue(true);
		const repositoryUpdateSpy = spyOn(repository, "update");

		await userUsernameUpdater.updateUsername({ id: user.id, username: user.username, now: NOW });

		expect(repositoryUpdateSpy).toHaveBeenCalledTimes(1);
	});

	it("records the previous and the new name when the username changes", async () => {
		const previousUsername = user.username;
		const recordSpy = spyOn(usernameChanges, "record");

		await userUsernameUpdater.updateUsername(request);

		expect(recordSpy).toHaveBeenCalledWith({
			userId: user.id,
			previousUsername,
			newUsername: request.username,
			changedAt: NOW,
		});
	});

	it("rejects a change made less than 30 days after the previous one", async () => {
		spyOn(usernameChanges, "lastChangeAt").mockResolvedValue(new Date(NOW.getTime() - 29 * DAY_MS));
		const repositoryUpdateSpy = spyOn(repository, "update");
		const recordSpy = spyOn(usernameChanges, "record");
		const previousUsername = user.username;

		await expect(userUsernameUpdater.updateUsername(request)).rejects.toThrow(
			new TooManyRequestsError("the username can be changed again on 2026-11-25"),
		);
		expect(repositoryUpdateSpy).not.toHaveBeenCalled();
		expect(recordSpy).not.toHaveBeenCalled();
		expect(user.username).toEqual(previousUsername);
	});

	it("allows a change once 30 days have passed since the previous one", async () => {
		spyOn(usernameChanges, "lastChangeAt").mockResolvedValue(new Date(NOW.getTime() - 30 * DAY_MS));
		const repositoryUpdateSpy = spyOn(repository, "update");

		await userUsernameUpdater.updateUsername(request);

		expect(repositoryUpdateSpy).toHaveBeenCalledTimes(1);
	});

	it("counts a change of letter case as a change", async () => {
		spyOn(usernameChanges, "lastChangeAt").mockResolvedValue(new Date(NOW.getTime() - DAY_MS));

		await expect(
			userUsernameUpdater.updateUsername({ id: user.id, username: "oldname", now: NOW }),
		).rejects.toThrow(TooManyRequestsError);
	});
});
