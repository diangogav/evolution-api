import { Elysia, t } from "elysia";

import { LeaderboardGetter } from "../../modules/leaderboard/application/LeaderboardGetter";
import { LeaderboardPostgresRepository } from "../../modules/leaderboard/infrastructure/LeaderboardPostgresRepository";

const leaderboardRepository = new LeaderboardPostgresRepository();

export const leaderboardRouter = new Elysia({ prefix: "/leaderboard" }).get(
	"/",
	async ({ query }) => {
		return new LeaderboardGetter(leaderboardRepository).get(query);
	},
	{
		query: t.Object({
			page: t.Number({ default: 1, minimum: 1 }),
			limit: t.Number({ default: 100, maximum: 100 }),
			banListName: t.String({ default: "Global" }),
		}),
	},
);
