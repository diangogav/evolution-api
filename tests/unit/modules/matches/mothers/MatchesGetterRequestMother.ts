import { faker } from "@faker-js/faker";

export class MatchesGetterRequestMother {
	static create(params?: Partial<{ userId: string; banListName: string; limit: number; page: number }>): {
		userId: string;
		banListName: string;
		limit: number;
		page: number;
	} {
		return {
			userId: faker.string.uuid(),
			banListName: faker.string.uuid(),
			limit: faker.number.int(),
			page: faker.number.int(),
			...params,
		};
	}
}
