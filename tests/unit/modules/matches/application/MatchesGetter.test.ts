import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { MatchesGetter } from "../../../../../src/modules/match/application/MatchesGetter";
import { Match } from "../../../../../src/modules/match/domain/Match";
import { MatchRepository } from "../../../../../src/modules/match/domain/MatchRepository";
import { MatchPostgresRepository } from "../../../../../src/modules/match/infrastructure/MatchPostgresRepository";
import { MatchesGetterRequestMother } from "../mothers/MatchesGetterRequestMother";
import { MatchMother } from "../mothers/MatchMother";

describe("MatchGetter", () => {
	let matchesGetter: MatchesGetter;
	let repository: MatchRepository;
	let matches: Match[];

	beforeEach(() => {
		repository = new MatchPostgresRepository();
		matchesGetter = new MatchesGetter(repository);
		matches = [MatchMother.create(), MatchMother.create(), MatchMother.create()];
	});

	it("Should return matches correctly", async () => {
		const spy = spyOn(repository, "get").mockResolvedValue(matches);
		const request = MatchesGetterRequestMother.create();

		const response = await matchesGetter.get(request);

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(request);
		expect(response).toEqual(matches);
	});
});
