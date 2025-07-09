import { faker } from "@faker-js/faker";

import { UserBan } from "../../../../../src/modules/user/domain/UserBan";

export class UserBanMother {
    static create(params?: Partial<UserBan>): UserBan {
        return UserBan.create({
            id: faker.string.uuid(),
            userId: faker.string.uuid(),
            reason: faker.lorem.sentence(),
            bannedAt: faker.date.recent(),
            bannedBy: faker.string.uuid(),
            createdAt: faker.date.recent(),
            updatedAt: faker.date.recent(),
            ...params,
        });
    }
}