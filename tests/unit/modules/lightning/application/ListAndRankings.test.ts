import { describe, expect, it } from "bun:test";

import { GetLightningRankings } from "../../../../../src/modules/lightning/application/GetLightningRankings";
import { ListLightningTournaments } from "../../../../../src/modules/lightning/application/ListLightningTournaments";
import { ALICE, BOB, CAROL, STARTS_AT, World } from "./fakes";

describe("ListLightningTournaments", () => {
	it("lists upcoming and running tournaments with their player counts, soonest first", async () => {
		const world = new World();
		world.seedTournament({
			id: "later",
			status: "scheduled",
			startsAt: new Date(STARTS_AT.getTime() + 3_600_000),
			endsAt: new Date(STARTS_AT.getTime() + 7_200_000),
		});
		world.seedTournament({ id: "now", status: "running" });
		world.seedTournament({ id: "done", status: "completed" });
		world.seedEntry(ALICE, { tournamentId: "now" });
		world.seedEntry(BOB, { tournamentId: "now", status: "withdrawn" });

		const list = await new ListLightningTournaments(world.tournamentRepository).run({});

		expect(list.map((t) => [t.id, t.status, t.players])).toEqual([
			["now", "running", 1],
			["later", "scheduled", 0],
		]);
		expect(list[0]).toMatchObject({ startsAt: STARTS_AT.toISOString(), format: "tcg" });
	});

	it("filters by a requested status", async () => {
		const world = new World();
		world.seedTournament({ id: "now", status: "running" });
		world.seedTournament({ id: "done", status: "completed" });

		const list = await new ListLightningTournaments(world.tournamentRepository).run({
			status: "completed",
		});

		expect(list.map((t) => t.id)).toEqual(["done"]);
	});
});

describe("GetLightningRankings", () => {
	it("numbers the season ranking by points", async () => {
		const world = new World();
		await world.resultRepository.addToRanking(ALICE, 7, 10, true, world.manager);
		await world.resultRepository.addToRanking(BOB, 7, 17, true, world.manager);
		await world.resultRepository.addToRanking(CAROL, 6, 99, true, world.manager);

		const ranking = await new GetLightningRankings(world.resultRepository).run({
			season: 7,
			limit: 50,
		});

		expect(ranking).toEqual([
			{
				position: 1,
				userId: BOB,
				username: "bob",
				points: 17,
				tournamentsWon: 1,
				tournamentsPlayed: 1,
			},
			{
				position: 2,
				userId: ALICE,
				username: "alice",
				points: 10,
				tournamentsWon: 1,
				tournamentsPlayed: 1,
			},
		]);
	});
});
