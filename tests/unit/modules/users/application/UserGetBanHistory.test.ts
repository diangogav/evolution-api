import { describe, it, expect, beforeEach } from "bun:test";
import { mock, MockProxy } from "jest-mock-extended";
import { UserGetBanHistory } from "../../../../../src/modules/user/application/UserGetBanHistory";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";
import { UserBanMother } from "../mothers/UserBanMother";

describe("UserGetBanHistory", () => {
    let repository: MockProxy<UserBanRepository>;
    let userGetBanHistory: UserGetBanHistory;

    beforeEach(() => {
        repository = mock<UserBanRepository>();
        userGetBanHistory = new UserGetBanHistory(repository);
    });

    it("Should return the user's ban history", async () => {
        const userId = "user-id-123";
        const bans = [
            UserBanMother.create(),
            UserBanMother.create(),
        ];
        repository.getBansByUserId.mockResolvedValue(bans);
        const result = await userGetBanHistory.execute(userId);
        expect(repository.getBansByUserId).toHaveBeenCalledWith(userId);
        expect(result).toBe(bans);
    });
}); 