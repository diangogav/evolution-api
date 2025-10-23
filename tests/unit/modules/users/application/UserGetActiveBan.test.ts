import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { UserGetActiveBan } from "../../../../../src/modules/user/application/UserGetActiveBan";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";
import { UserBanMother } from "../mothers/UserBanMother";

describe("UserGetActiveBan", () => {
    let repository: UserBanRepository;
    let userGetActiveBan: UserGetActiveBan;

    beforeEach(() => {
        repository = {
            banUser: async () => undefined,
            findActiveBanByUserId: async () => null,
            unbanUser: async () => undefined,
            getBansByUserId: async () => [],
            finishActiveBan: async () => undefined,
        } 
        userGetActiveBan = new UserGetActiveBan(repository);
    });

    it("Should return the active ban if it exists", async () => {
        const userId = "user-id-123";
        const ban = UserBanMother.create();
        spyOn(repository, "findActiveBanByUserId").mockResolvedValue(ban);
        const result = await userGetActiveBan.execute(userId);
        expect(repository.findActiveBanByUserId).toHaveBeenCalledWith(userId);
        expect(result).toBe(ban);
    });

    it("Should return null if no ban is active", async () => {
        const userId = "user-id-456";
        spyOn(repository, "findActiveBanByUserId").mockResolvedValue(null);
        const result = await userGetActiveBan.execute(userId);
        expect(result).toBeNull();
    });
}); 