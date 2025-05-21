import { beforeEach, describe, expect, it } from "bun:test";
import { mock, MockProxy } from "jest-mock-extended";

import { UserStatsFinder } from "../../../../../src/modules/stats/application/UserStatsFinder";
import { UserStats } from "../../../../../src/modules/stats/domain/UserStats";
import { UserStatsRepository } from "../../../../../src/modules/stats/domain/UserStatsRepository";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UserStatsMother } from "../mothers/UserStatsMother";
import { config } from "src/config";

describe("UserStatsFinder", () => {
	let userStatsFinder: UserStatsFinder;
	let repository: MockProxy<UserStatsRepository>;
	let userStats: UserStats;

	beforeEach(() => {
		repository = mock<UserStatsRepository>();
		userStatsFinder = new UserStatsFinder(repository);
		userStats = UserStatsMother.create();
	});

	it("Should return user stats when they exist for the given user and ban list", async () => {
		repository.find.mockResolvedValue(userStats);
		const response = await userStatsFinder.find({
			userId: userStats.userId,
			banListName: "Global",
			season: config.season,
		});
		expect(repository.find).toHaveBeenCalledTimes(1);
		expect(repository.find).toHaveBeenCalledWith(userStats.userId, "Global", config.season);
		expect(response).toEqual(userStats.toJson());
	});

	it("Should default to the 'Global' ban list when none is specified", async () => {
		repository.find.mockResolvedValue(userStats);
		const response = await userStatsFinder.find({ userId: userStats.userId, season: config.season });
		expect(repository.find).toHaveBeenCalledTimes(1);
		expect(repository.find).toHaveBeenCalledWith(userStats.userId, "Global", config.season);
		expect(response).toEqual(userStats.toJson());
	});

	it("Should throw NotFoundError when stats are not found for the given user", async () => {
		repository.find.mockResolvedValue(null);
		expect(userStatsFinder.find({ userId: userStats.userId, season: config.season })).rejects.toThrow(
			new NotFoundError(`Stats for user with id ${userStats.userId} not found.`),
		);
	});
});
