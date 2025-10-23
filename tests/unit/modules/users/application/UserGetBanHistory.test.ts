import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { UserGetBanHistory } from "../../../../../src/modules/user/application/UserGetBanHistory";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";
import { UserBanMother } from "../mothers/UserBanMother";

describe("UserGetBanHistory", () => {
    let repository: UserBanRepository;
    let userGetBanHistory: UserGetBanHistory;

    beforeEach(() => {
        repository = {
            banUser: async () => undefined,
            findActiveBanByUserId: async () => null,
            unbanUser: async () => undefined,
            getBansByUserId: async () => [],
            finishActiveBan: async () => undefined,
        } 
        userGetBanHistory = new UserGetBanHistory(repository);
    });

    it("Should return the user's ban history", async () => {
        const userId = "user-id-123";
        const bans = [
            UserBanMother.create(),
            UserBanMother.create(),
        ];
        spyOn(repository, "getBansByUserId").mockResolvedValue(bans);
        const result = await userGetBanHistory.execute(userId);
        expect(repository.getBansByUserId).toHaveBeenCalledWith(userId);
        expect(result).toBe(bans);
    });
}); 