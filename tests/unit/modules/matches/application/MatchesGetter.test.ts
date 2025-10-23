import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { MatchesGetter } from "../../../../../src/modules/match/application/MatchesGetter";
import { Match } from "../../../../../src/modules/match/domain/Match";
import { MatchRepository } from "../../../../../src/modules/match/domain/MatchRepository";
import { MatchesGetterRequestMother } from "../mothers/MatchesGetterRequestMother";
import { MatchMother } from "../mothers/MatchMother";

describe("MatchGetter", () => {
	let matchesGetter: MatchesGetter;
	let repository: MatchRepository;
	let matches: Match[];

	beforeEach(() => {
		repository = {
			get: async () => [],
		}
		matchesGetter = new MatchesGetter(repository);
		matches = [MatchMother.create(), MatchMother.create(), MatchMother.create()];
	});

	it("Should return matches correctly", async () => {
		spyOn(repository, "get").mockResolvedValue(matches);
		const request = MatchesGetterRequestMother.create();

		const response = await matchesGetter.get(request);

		expect(repository.get).toHaveBeenCalledTimes(1);
		expect(repository.get).toHaveBeenCalledWith(request);
		expect(response).toEqual(matches);
	});
});
