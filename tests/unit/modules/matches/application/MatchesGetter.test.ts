import { beforeEach, describe, expect, it } from "bun:test";
import { mock, MockProxy } from "jest-mock-extended";

import { MatchesGetter } from "../../../../../src/modules/match/application/MatchesGetter";
import { Match } from "../../../../../src/modules/match/domain/Match";
import { MatchRepository } from "../../../../../src/modules/match/domain/MatchRepository";
import { MatchesGetterRequestMother } from "../mothers/MatchesGetterRequestMother";
import { MatchMother } from "../mothers/MatchMother";

describe("MatchGetter", () => {
	let matchesGetter: MatchesGetter;
	let repository: MockProxy<MatchRepository>;
	let matches: Match[];

	beforeEach(() => {
		repository = mock<MatchRepository>();
		matchesGetter = new MatchesGetter(repository);
		matches = [MatchMother.create(), MatchMother.create(), MatchMother.create()];
	});

	it("Should return matches correctly", async () => {
		repository.get.mockResolvedValue(matches);
		const request = MatchesGetterRequestMother.create();

		const response = await matchesGetter.get(request);

		expect(repository.get).toHaveBeenCalledTimes(1);
		expect(repository.get).toHaveBeenCalledWith(request);
		expect(response).toEqual(matches);
	});
});
