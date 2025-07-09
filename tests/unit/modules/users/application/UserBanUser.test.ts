import { describe, it, expect, beforeEach } from "bun:test";
import { mock, MockProxy } from "jest-mock-extended";
import { UserBanUser } from "../../../../../src/modules/user/application/UserBanUser";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";
import { UserMother } from "../mothers/UserMother";


describe("UserBanUser", () => {
    let repository: MockProxy<UserBanRepository>;
    let userBanUser: UserBanUser;

    beforeEach(() => {
        repository = mock<UserBanRepository>();
        userBanUser = new UserBanUser(repository);
    });

    it("Should ban a user by calling banUser in the repository", async () => {
        const user = UserMother.create();
        const admin = UserMother.create();
        const reason = "Inappropriate conduct";
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 día

        await userBanUser.execute({
            userId: user.id,
            reason,
            bannedBy: admin.id,
            expiresAt,
        });

        expect(repository.banUser).toHaveBeenCalledTimes(1);
        const calledWith = repository.banUser.mock.calls[0][0];
        expect(calledWith.userId).toBe(user.id);
        expect(calledWith.reason).toBe(reason);
        expect(calledWith.bannedBy).toBe(admin.id);
        expect(calledWith.expiresAt).toEqual(expiresAt);
    });
}); 