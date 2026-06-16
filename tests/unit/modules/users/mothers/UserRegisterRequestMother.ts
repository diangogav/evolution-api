import { faker } from "@faker-js/faker";

export class UserRegisterRequestMother {
	static create(params?: Partial<{ id: string; email: string; username: string; password: string }>): {
		id: string;
		email: string;
		username: string;
		password: string;
	} {
		return {
			id: faker.string.uuid(),
			email: faker.internet.email(),
			username: faker.internet.username().slice(0, 14),
			password: "yugi2024",
			...params,
		};
	}
}
