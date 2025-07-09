import { faker } from "@faker-js/faker";

import { User } from "../../../../../src/modules/user/domain/User";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";

export class UserMother {
	static create(params?: Partial<User>): User {
		return User.from({
			id: faker.string.uuid(),
			username: faker.internet.username(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: UserProfileRole.USER,
			...params,
		});
	}
}
