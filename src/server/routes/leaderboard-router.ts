import { Elysia, t } from "elysia";

import { UserStatsLeaderboardGetter } from "../../modules/stats/application/UserStatsLeaderboardGetter";
import { UserStatsPostgresRepository } from "../../modules/stats/infrastructure/UserStatsPostgresRepository";
import { TierResolver } from "../../modules/tiers/application/TierResolver";
import { TiersPostgresRepository } from "../../modules/tiers/infrastructure/TiersPostgresRepository";

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
					200: {
						description: "Leaderboard retrieved successfully",
						content: {
							"application/json": {
								example: {
									data: [
										{
											userId: "user-1",
											username: "Player1",
											email: "player1@example.com",
											points: 150,
											tournamentsWon: 5,
											tournamentsPlayed: 20,
											rank: 1,
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
										{
											userId: "user-2",
											username: "Player2",
											email: "player2@example.com",
											points: 96,
											tournamentsWon: 2,
											tournamentsPlayed: 14,
											rank: 2,
											rating: 1064,
											peak: 1102,
											provisional: false,
											tier: {
												id: "gold",
												name: "Gold",
												effectivePoints: 17,
												gamesPlayed: 34,
												progress: {
													nextTierId: "platinum",
													unit: "points",
													current: 17,
													target: 25,
													distinctOpponentWins: { current: 4, required: 5 },
												},
											},
										},
									],
									total: 100,
									page: 1,
									limit: 100,
								},
							},
						},
					},
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
				description: "Retrieves the best player from the last completed week",
				responses: {
					200: {
						description: "Player of the week retrieved successfully",
						content: {
							"application/json": {
								example: {
									userId: "user-123",
									username: "TopPlayer",
									email: "topplayer@example.com",
									points: 50,
									tournamentsWon: 3,
									tournamentsPlayed: 5,
									weekNumber: 45,
									year: 2025,
								},
							},
						},
					},
					404: { description: "No player found for last week" },
				},
			},
		},
	);
