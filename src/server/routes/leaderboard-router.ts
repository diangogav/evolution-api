import { Elysia, t } from "elysia";

import { UserStatsLeaderboardGetter } from "../../modules/stats/application/UserStatsLeaderboardGetter";
import { UserStatsPostgresRepository } from "../../modules/stats/infrastructure/UserStatsPostgresRepository";

const userStatsRepository = new UserStatsPostgresRepository();

export const leaderboardRouter = new Elysia({ prefix: "/stats" }).get(
	"/",
	async ({ query }) => {
		return new UserStatsLeaderboardGetter(userStatsRepository).get(query);
	},
	{
		query: t.Object({
			page: t.Number({ default: 1, minimum: 1 }),
			limit: t.Number({ default: 100, maximum: 100 }),
			banListName: t.String({ default: "Global" }),
		}),
	},
);
