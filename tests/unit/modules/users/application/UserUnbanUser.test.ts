import { describe, it, expect, beforeEach } from "bun:test";
import { UserUnbanUser } from "../../../../../src/modules/user/application/UserUnbanUser";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";

describe("UserUnbanUser", () => {
    let repository: UserBanRepository;
    let userUnbanUser: UserUnbanUser;

    beforeEach(() => {
        repository = {
            banUser: async () => undefined,
            findActiveBanByUserId: async () => null,
            unbanUser: async () => undefined,
            getBansByUserId: async () => [],
            finishActiveBan: async () => undefined,
        } 
        userUnbanUser = new UserUnbanUser(repository);
    });

    it("Should unban (expire ban) by calling unbanUser in the repository", async () => {
        const banId = "ban-id-123";
        await userUnbanUser.execute(banId);
        expect(repository.unbanUser).toHaveBeenCalledTimes(1);
        expect(repository.unbanUser).toHaveBeenCalledWith(banId);
    });
}); 