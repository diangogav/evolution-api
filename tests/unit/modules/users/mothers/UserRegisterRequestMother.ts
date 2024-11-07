import { faker } from "@faker-js/faker";

export class UserRegisterRequestMother {
	static create(params?: { id: string; email: string; username: string }): {
		id: string;
		email: string;
		username: string;
	} {
		return {
			id: faker.string.uuid(),
			email: faker.internet.email(),
			username: faker.internet.password(),
			...params,
		};
	}
}
