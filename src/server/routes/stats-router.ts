import { Elysia, t } from "elysia";
import { StatsController } from "../../modules/stats/infrastructure/StatsController";
import { GlobalStatsResponseSchema } from "../../modules/stats/infrastructure/StatsSchemas";
import { jsonOk } from "../openapi/responses";

export const statsRouter = new Elysia().group("/historical-stats", (app) =>
	app.get(
		"/",
		({ query }) => new StatsController().getGlobalStats({ query: query as { season?: string } }),
		{
			detail: {
				tags: ["Statistics"],
				summary: "Get global statistics",
				description: "Retrieves global statistics, historical charts, and daily usage.",
				responses: {
					200: jsonOk(GlobalStatsResponseSchema, "Statistics retrieved successfully", {
						stats: { totalDuels: 1000, activeBanLists: 5, avgDuelsPerBanList: 200 },
						historical: [{ name: "Season 1", value: 100 }],
						banListBreakdown: [
							{ banListName: "TCG", totalDuels: 100, percentage: 10, popularity: 100 },
						],
						dailyDuels: [{ date: "2026-09-01", banListName: "TCG", count: 10 }],
					}),
				},
			},
			query: t.Object({
				season: t.Optional(t.String()),
			}),
		},
	),
);
