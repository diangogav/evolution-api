import { Elysia, t } from "elysia";
import { StatsController } from "../../modules/stats/infrastructure/StatsController";

export const statsRouter = new Elysia()
    .group("/stats", (app) =>
        app.get("/", ({ query }) => new StatsController().getGlobalStats({ query: query as { season?: string } }), {
            detail: {
                tags: ['Statistics'],
                summary: 'Get global statistics',
                description: 'Retrieves global statistics, historical charts, and daily usage.',
                responses: {
                    200: {
                        description: 'Statistics retrieved successfully',
                        content: {
                            'application/json': {
                                example: {
                                    stats: { totalDuels: 1000, activeBanLists: 5, avgDuelsPerBanList: 200 },
                                    historical: [{ name: 'Season 1', value: 100 }],
                                    banListBreakdown: [{ banListName: 'TCG', totalDuels: 100 }],
                                    dailyDuels: [{ date: '2023-01-01', count: 10 }]
                                }
                            }
                        }
                    }
                }
            },
            query: t.Object({
                season: t.Optional(t.String())
            })
        })
    );
