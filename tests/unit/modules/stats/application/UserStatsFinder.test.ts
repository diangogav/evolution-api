import { beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UserStatsFinder } from "../../../../../src/modules/stats/application/UserStatsFinder";
import { UserStats } from "../../../../../src/modules/stats/domain/UserStats";
import { UserStatsRepository } from "../../../../../src/modules/stats/domain/UserStatsRepository";
import { UserStatsPostgresRepository } from "../../../../../src/modules/stats/infrastructure/UserStatsPostgresRepository";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { UserStatsMother } from "../mothers/UserStatsMother";

describe("UserStatsFinder", () => {
	let userStatsFinder: UserStatsFinder;
	let repository: UserStatsRepository;
	let userStats: UserStats;

	beforeEach(() => {
		repository = new UserStatsPostgresRepository();
		userStatsFinder = new UserStatsFinder(repository);
		userStats = UserStatsMother.create();
	});

	it("Should return user stats when they exist for the given user and ban list", async () => {
		const spy = spyOn(repository, "find").mockResolvedValue(userStats);
		const response = await userStatsFinder.find({ userId: userStats.userId, banListName: "Global" });
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(userStats.userId, "Global");
		expect(response).toEqual(userStats.toJson());
	});

	it("Should default to the 'Global' ban list when none is specified", async () => {
		const spy = spyOn(repository, "find").mockResolvedValue(userStats);
		const response = await userStatsFinder.find({ userId: userStats.userId });
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(userStats.userId, "Global");
		expect(response).toEqual(userStats.toJson());
	});

	it("Should throw NotFoundError when stats are not found for the given user", async () => {
		spyOn(repository, "find").mockResolvedValue(null);
		expect(userStatsFinder.find({ userId: userStats.userId })).rejects.toThrow(
			new NotFoundError(`Stats for user with id ${userStats.userId} not found.`),
		);
	});
});
