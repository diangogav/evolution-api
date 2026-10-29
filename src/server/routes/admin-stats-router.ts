import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { GetActivityStats } from "../../modules/activity-stats/application/GetActivityStats";
import { BUCKET_LIMITS } from "../../modules/activity-stats/domain/ActivityRange";
import { ActivityStatsPostgresRepository } from "../../modules/activity-stats/infrastructure/ActivityStatsPostgresRepository";
import {
	ActivityPeriodSchema,
	ActivityStatsSchema,
} from "../../modules/activity-stats/infrastructure/ActivityStatsSchemas";
import { JWT } from "../../shared/JWT";
import type { AdminAuthorizer } from "../auth/AdminAuthorizer";
import { JwtAdminAuthorizer } from "../auth/AdminAuthorizer";
import { errorResponses, jsonOk } from "../openapi/responses";

export interface AdminStatsRouterDependencies {
	readonly authorizer: AdminAuthorizer;
	readonly getActivityStats: Pick<GetActivityStats, "run">;
	readonly clock: () => Date;
}

const LARGEST_CAP = Math.max(...Object.values(BUCKET_LIMITS).map((limit) => limit.max));

export function createAdminStatsRouter(deps: AdminStatsRouterDependencies) {
	return new Elysia({ prefix: "/admin/stats" }).use(bearer()).get(
		"/activity",
		({ bearer: token, query }) => {
			deps.authorizer.requireAdmin(token);
			return deps.getActivityStats.run({
				period: query.period,
				buckets: query.buckets,
				now: deps.clock(),
			});
		},
		{
			query: t.Object({
				period: ActivityPeriodSchema,
				buckets: t.Optional(
					t.Integer({
						minimum: 1,
						maximum: LARGEST_CAP,
						description: `Number of buckets, current one included. Defaults: day ${BUCKET_LIMITS.day.default}, week ${BUCKET_LIMITS.week.default}, month ${BUCKET_LIMITS.month.default}. Caps: day ${BUCKET_LIMITS.day.max}, week ${BUCKET_LIMITS.week.max}, month ${BUCKET_LIMITS.month.max}`,
					}),
				),
			}),
			detail: {
				tags: ["Activity Stats"],
				summary: "Server activity per day, week or month",
				description:
					"New users, active players, ranked and unranked matches (DW bot games excluded), EvoDuel ranked and unranked matches and a per ban list breakdown, in UTC buckets. EvoDuel counts only cover matches recorded since the game server started storing each player's client.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: jsonOk(ActivityStatsSchema, "Zero-filled activity buckets, oldest first", {
						period: "day",
						from: "2026-10-28T00:00:00.000Z",
						to: "2026-10-30T00:00:00.000Z",
						buckets: [
							{
								start: "2026-10-28T00:00:00.000Z",
								newUsers: 0,
								activePlayers: 0,
								rankedMatches: 0,
								unrankedMatches: 0,
								evoduelRankedMatches: 0,
								evoduelUnrankedMatches: 0,
								botMatchesExcluded: 0,
							},
							{
								start: "2026-10-29T00:00:00.000Z",
								newUsers: 12,
								activePlayers: 140,
								rankedMatches: 210,
								unrankedMatches: 380,
								evoduelRankedMatches: 30,
								evoduelUnrankedMatches: 95,
								botMatchesExcluded: 40,
							},
						],
						byBanList: [
							{
								start: "2026-10-29T00:00:00.000Z",
								banListName: "Edison",
								rankedMatches: 50,
								unrankedMatches: 20,
							},
						],
					}),
					...errorResponses(400, 401, 403, 422),
				},
			},
		},
	);
}

export const adminStatsRouter = createAdminStatsRouter({
	authorizer: new JwtAdminAuthorizer(new JWT(config.jwt)),
	getActivityStats: new GetActivityStats(new ActivityStatsPostgresRepository()),
	clock: () => new Date(),
});
