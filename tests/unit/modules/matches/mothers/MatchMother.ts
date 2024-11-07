import { faker } from "@faker-js/faker";

import { Match } from "../../../../../src/modules/match/domain/Match";

export class MatchMother {
	static create(params?: Partial<Match>): Match {
		return Match.from({
			userId: faker.string.uuid(),
			bestOf: faker.number.int(),
			banListName: faker.string.alphanumeric(),
			playerNames: [faker.internet.username()],
			opponentNames: [faker.internet.username()],
			playerScore: faker.number.int(),
			opponentScore: faker.number.int(),
			points: faker.number.int(),
			winner: faker.datatype.boolean(),
			date: faker.date.past(),
			...params,
		});
	}
}
