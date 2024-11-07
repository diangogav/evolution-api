import { faker } from "@faker-js/faker";

import { UserStats } from "../../../../../src/modules/stats/domain/UserStats";

export class UserStatsMother {
	static create(params?: Partial<UserStats>): UserStats {
		return UserStats.from({
			userId: faker.string.uuid(),
			username: faker.internet.username(),
			points: faker.number.int(),
			wins: faker.number.int(),
			losses: faker.number.int(),
			winRate: faker.number.float().toString(),
			position: faker.number.int(),
			...params,
		});
	}

	static createMany(quantity: number): UserStats[] {
		const stats: UserStats[] = [];

		for (let i = 1; i <= quantity; i++) {
			stats.push(UserStatsMother.create());
		}

		return stats;
	}
}
