import { faker } from "@faker-js/faker";

export class UserAuthRequestMother {
	static create(params?: { email: string; password: string }): { email: string; password: string } {
		return {
			email: faker.internet.email(),
			password: faker.internet.password(),
			...params,
		};
	}
}
