import { describe, it, expect, beforeEach } from "bun:test";
import { mock, MockProxy } from "jest-mock-extended";
import { UserGetActiveBan } from "../../../../../src/modules/user/application/UserGetActiveBan";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";
import { UserBanMother } from "../mothers/UserBanMother";

describe("UserGetActiveBan", () => {
    let repository: MockProxy<UserBanRepository>;
    let userGetActiveBan: UserGetActiveBan;

    beforeEach(() => {
        repository = mock<UserBanRepository>();
        userGetActiveBan = new UserGetActiveBan(repository);
    });

    it("Should return the active ban if it exists", async () => {
        const userId = "user-id-123";
        const ban = UserBanMother.create();
        repository.findActiveBanByUserId.mockResolvedValue(ban);
        const result = await userGetActiveBan.execute(userId);
        expect(repository.findActiveBanByUserId).toHaveBeenCalledWith(userId);
        expect(result).toBe(ban);
    });

    it("Should return null if no ban is active", async () => {
        const userId = "user-id-456";
        repository.findActiveBanByUserId.mockResolvedValue(null);
        const result = await userGetActiveBan.execute(userId);
        expect(result).toBeNull();
    });
}); 