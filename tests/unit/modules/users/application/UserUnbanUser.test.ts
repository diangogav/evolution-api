import { describe, it, expect, beforeEach } from "bun:test";
import { mock, MockProxy } from "jest-mock-extended";
import { UserUnbanUser } from "../../../../../src/modules/user/application/UserUnbanUser";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";

describe("UserUnbanUser", () => {
    let repository: MockProxy<UserBanRepository>;
    let userUnbanUser: UserUnbanUser;

    beforeEach(() => {
        repository = mock<UserBanRepository>();
        userUnbanUser = new UserUnbanUser(repository);
    });

    it("Should unban (expire ban) by calling unbanUser in the repository", async () => {
        const banId = "ban-id-123";
        await userUnbanUser.execute(banId);
        expect(repository.unbanUser).toHaveBeenCalledTimes(1);
        expect(repository.unbanUser).toHaveBeenCalledWith(banId);
    });
}); 