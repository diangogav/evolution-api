import { faker } from "@faker-js/faker";

import { User } from "../../../../../src/modules/user/domain/User";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";

export class UserMother {
	static create(params?: Partial<User>): User {
		return User.from({
			id: faker.string.uuid(),
			username: faker.string.sample({ min: 1, max: 14 }),
			email: faker.internet.email(),
			password: faker.internet.password(),
			securePassword: null,
			role: UserProfileRole.USER,
			participantId: null,
			...params,
		});
	}
}
