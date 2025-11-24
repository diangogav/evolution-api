import { Elysia, t } from "elysia";

import { UserStatsLeaderboardGetter } from "../../modules/stats/application/UserStatsLeaderboardGetter";
import { UserStatsPostgresRepository } from "../../modules/stats/infrastructure/UserStatsPostgresRepository";

import { config } from "./../../config/index";
import { GetBestPlayerOfLastCompletedWeek } from "../../modules/stats/application/GetBestPlayerOfLastCompletedWeek";

const userStatsRepository = new UserStatsPostgresRepository();

export const leaderboardRouter = new Elysia({ prefix: "/stats" }).get(
	"/",
	async ({ query }) => {
		return new UserStatsLeaderboardGetter(userStatsRepository).get(query);
	},
	{
		detail: {
			tags: ['Leaderboard'],
			summary: 'Get leaderboard',
			description: 'Retrieves paginated leaderboard with player rankings for a specific season and ban list',
			responses: {
				200: {
					description: 'Leaderboard retrieved successfully',
					content: {
						'application/json': {
							example: {
								data: [
									{
										userId: 'user-1',
										username: 'Player1',
										email: 'player1@example.com',
										points: 150,
										tournamentsWon: 5,
										tournamentsPlayed: 20,
										rank: 1
									}
								],
								total: 100,
								page: 1,
								limit: 100
							}
						}
					}
				}
			}
		},
		query: t.Object({
			page: t.Number({ default: 1, minimum: 1 }),
			limit: t.Number({ default: 100, maximum: 100 }),
			banListName: t.String({ default: "Global" }),
			season: t.Number({ default: config.season }),
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
				tags: ['Leaderboard'],
				summary: 'Get player of the week',
				description: 'Retrieves the best player from the last completed week',
				responses: {
					200: {
						description: 'Player of the week retrieved successfully',
						content: {
							'application/json': {
								example: {
									userId: 'user-123',
									username: 'TopPlayer',
									email: 'topplayer@example.com',
									points: 50,
									tournamentsWon: 3,
									tournamentsPlayed: 5,
									weekNumber: 45,
									year: 2025
								}
							}
						}
					},
					404: { description: 'No player found for last week' }
				}
			}
		}
	);
