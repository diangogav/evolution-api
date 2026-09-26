import { Elysia, t } from "elysia";

import { UserStatsLeaderboardGetter } from "../../modules/stats/application/UserStatsLeaderboardGetter";
import { UserStatsPostgresRepository } from "../../modules/stats/infrastructure/UserStatsPostgresRepository";
import { TierResolver } from "../../modules/tiers/application/TierResolver";
import { TiersPostgresRepository } from "../../modules/tiers/infrastructure/TiersPostgresRepository";
import {
	LeaderboardSchema,
	PlayerOfTheWeekSchema,
} from "../../modules/stats/infrastructure/StatsSchemas";
import { jsonOk, errorResponses } from "../openapi/responses";

import { config } from "./../../config/index";
import { GetBestPlayerOfLastCompletedWeek } from "../../modules/stats/application/GetBestPlayerOfLastCompletedWeek";

const userStatsRepository = new UserStatsPostgresRepository();
const tierResolver = new TierResolver(new TiersPostgresRepository());

export const leaderboardRouter = new Elysia({ prefix: "/stats" })
	.get(
		"/",
		async ({ query }) => {
			return new UserStatsLeaderboardGetter(userStatsRepository, tierResolver).get(query);
		},
		{
			detail: {
				tags: ["Leaderboard"],
				summary: "Get leaderboard",
				description:
					"Retrieves paginated leaderboard with player rankings for a specific season and ban list, sorted by points or by Elo rating. Each row carries its live ranked tier (see TierViewSchema), computed for the page's users only; only Master exposes rating and peak inside tier, and tier is null for ranks without a ladder, such as Global.",
				responses: {
					200: jsonOk(LeaderboardSchema, "Leaderboard page retrieved successfully", [
						{
							userId: "user-1",
							username: "Player1",
							points: 150,
							wins: 80,
							losses: 41,
							winRate: "66.12",
							position: 1,
							achievements: [],
							ratings: [],
							rating: 1120,
							peak: 1180,
							provisional: false,
							tier: {
								id: "master",
								name: "Master",
								effectivePoints: 47,
								gamesPlayed: 61,
								progress: null,
								rating: 1120,
								peak: 1180,
							},
						},
					]),
					...errorResponses(422),
				},
			},
			query: t.Object({
				page: t.Number({ default: 1, minimum: 1 }),
				limit: t.Number({ default: 100, maximum: 100 }),
				banListName: t.String({ default: "Global" }),
				season: t.Number({ default: config.season }),
				sortBy: t.Optional(
					t.Union([t.Literal("points"), t.Literal("rating")], { default: "points" }),
				),
			}),
		},
	)
	.get(
		"/player-of-the-week",
		async () => {
			return new GetBestPlayerOfLastCompletedWeek(userStatsRepository).get();
		},
		{
			detail: {
				tags: ["Leaderboard"],
				summary: "Get player of the week",
				description:
					"Retrieves the players with the most points in the last completed UTC week: several when tied, none when no match was played.",
				responses: {
					200: jsonOk(PlayerOfTheWeekSchema, "Players of the week retrieved successfully", [
						{
							userId: "user-123",
							username: "TopPlayer",
							points: 50,
							wins: 12,
							losses: 3,
							from: "2026-09-14T00:00:00.000Z",
							to: "2026-09-20T00:00:00.000Z",
						},
					]),
				},
			},
		},
	);
