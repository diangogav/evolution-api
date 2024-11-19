import { faker } from "@faker-js/faker";

export class UserUsernameUpdaterRequestMother {
	static create(params?: Partial<{ id: string; username: string }>): { id: string; username: string } {
		return {
			id: faker.string.uuid(),
			username: faker.string.sample({ min: 1, max: 14 }),
			...params,
		};
	}
}
