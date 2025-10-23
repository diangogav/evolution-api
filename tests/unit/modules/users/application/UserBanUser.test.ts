import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { UserBanUser } from "../../../../../src/modules/user/application/UserBanUser";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";
import { UserMother } from "../mothers/UserMother";


describe("UserBanUser", () => {
    let repository: UserBanRepository;
    let userBanUser: UserBanUser;

    beforeEach(() => {
        repository = {
            banUser: async () => undefined,
            findActiveBanByUserId: async () => null,
            unbanUser: async () => undefined,
            getBansByUserId: async () => [],
            finishActiveBan: async () => undefined,
        } 
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
        expect(banSpy).toHaveBeenCalledWith(expect.objectContaining({
            userId: user.id,
            reason,
            bannedBy: admin.id,
            expiresAt,
        }));
    });
}); 