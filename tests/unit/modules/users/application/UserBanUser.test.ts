import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { UserBanUser } from "../../../../../src/modules/user/application/UserBanUser";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UserMother } from "../mothers/UserMother";

describe("UserBanUser", () => {
	let repository: UserBanRepository;
	let userBanUser: UserBanUser;

	beforeEach(() => {
		repository = {
			userExists: async () => true,
			banUser: async () => undefined,
			findActiveBanByUserId: async () => null,
			unbanUser: async () => undefined,
			getBansByUserId: async () => [],
			finishActiveBan: async () => undefined,
		};
		userBanUser = new UserBanUser(repository);
	});

	it("Should ban a user by calling banUser in the repository", async () => {
		const user = UserMother.create();
		const admin = UserMother.create();
		const reason = "Inappropriate conduct";
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 día

		const banSpy = spyOn(repository, "banUser");

		await userBanUser.execute({
			userId: user.id,
			reason,
			bannedBy: admin.id,
			expiresAt,
		});

		expect(banSpy).toHaveBeenCalled();
		expect(banSpy).toHaveBeenCalledTimes(1);
		expect(banSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: user.id,
				reason,
				bannedBy: admin.id,
				expiresAt,
			}),
		);
	});

	it("Should ban an already soft-deleted (previously banned) user", async () => {
		const user = UserMother.create();
		const admin = UserMother.create();
		spyOn(repository, "userExists").mockResolvedValue(true);
		const banSpy = spyOn(repository, "banUser");

		await userBanUser.execute({
			userId: user.id,
			reason: "Repeat offense",
			bannedBy: admin.id,
		});

		expect(repository.userExists).toHaveBeenCalledWith(user.id);
		expect(banSpy).toHaveBeenCalledTimes(1);
	});

	it("Should reject with NotFoundError and write nothing when the user does not exist", async () => {
		spyOn(repository, "userExists").mockResolvedValue(false);
		const finishActiveBanSpy = spyOn(repository, "finishActiveBan");
		const banSpy = spyOn(repository, "banUser");

		await expect(
			userBanUser.execute({
				userId: "unknown-user",
				reason: "Inappropriate conduct",
				bannedBy: "admin-1",
			}),
		).rejects.toThrow(NotFoundError);

		expect(finishActiveBanSpy).not.toHaveBeenCalled();
		expect(banSpy).not.toHaveBeenCalled();
	});
});
