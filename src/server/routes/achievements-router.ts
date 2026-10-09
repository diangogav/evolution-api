import { Elysia, t } from "elysia";

import { GetAchievementCatalog } from "../../modules/achievements/application/GetAchievementCatalog";
import { AchievementCatalogPostgresRepository } from "../../modules/achievements/infrastructure/AchievementCatalogPostgresRepository";
import { UserAchievementRecordPostgresRepository } from "../../modules/achievements/infrastructure/UserAchievementRecordPostgresRepository";
import { GetUserAchievementRecord } from "../../modules/achievements/application/GetUserAchievementRecord";
import {
	AchievementCatalogSchema,
	UserAchievementRecordSchema,
} from "../../modules/achievements/infrastructure/AchievementsSchemas";
import { emptyOk, errorResponses, jsonOk } from "../openapi/responses";

type Dependencies = { getCatalog: GetAchievementCatalog };

const matchesEtag = (header: string | null, etag: string): boolean =>
	header !== null &&
	header
		.split(",")
		.map((candidate) => candidate.trim().replace(/^W\//, ""))
		.some((candidate) => candidate === "*" || candidate === etag);

export const createAchievementsRouter = ({ getCatalog }: Dependencies) =>
	new Elysia({ prefix: "/achievements" }).get(
		"/",
		async ({ request, set }) => {
			const catalog = await getCatalog.run();
			const etag = `"${catalog.version}"`;

			set.headers.etag = etag;
			set.headers["cache-control"] = "public, no-cache";

			if (matchesEtag(request.headers.get("if-none-match"), etag)) {
				set.status = 304;

				return "";
			}

			return catalog;
		},
		{
			detail: {
				tags: ["Achievements"],
				summary: "Get the gameplay achievement catalog",
				description:
					"Lists the gameplay achievements with the requirement each one measures. The version is a digest of the catalog and doubles as the ETag: send it back in If-None-Match to receive 304 while nothing changed. Public: no credentials required.",
				responses: {
					200: jsonOk(AchievementCatalogSchema, "Catalog retrieved successfully", {
						version: "3f1c0a5e0d7b4c9a8e2f6b1d4a7c9e0f2b5d8a1c4e7f0a3b6c9d2e5f8a1b4c7d",
						items: [
							{
								id: 1001,
								code: "first_win",
								icon: "sword",
								name: "First Blood",
								description: "Win your first ranked match",
								earnedPoints: 0,
								requirement: { metric: "rankedWins", target: 1 },
							},
						],
					}),
					304: emptyOk("The catalog still matches the version in If-None-Match"),
				},
			},
		},
	);

export const achievementsRouter = createAchievementsRouter({
	getCatalog: new GetAchievementCatalog(new AchievementCatalogPostgresRepository()),
});

export const createUserAchievementsRouter = ({
	getRecord,
}: {
	getRecord: GetUserAchievementRecord;
}) =>
	new Elysia({ prefix: "/users" }).get(
		"/:userId/achievements",
		({ params }) => getRecord.run(params.userId),
		{
			detail: {
				tags: ["Achievements"],
				summary: "Get a user's achievement record",
				description:
					"Returns every award the user holds plus lifetime ranked progress (wins, matches, current win streak and a first-win flag per format ladder) computed from non-annulled, non-deleted ranked matches across all seasons. Season counters from the stats endpoint are not lifetime progress. Public, like the user stats.",
				responses: {
					200: jsonOk(UserAchievementRecordSchema, "Record retrieved successfully", {
						userId: "user-123",
						asOf: "2026-10-09T20:00:00.000Z",
						scope: "lifetime-ranked",
						achievements: [
							{
								awardId: "5b2c0e9e-7a4f-4c3b-9d1e-2f6a8b0c4d3e",
								id: 1001,
								code: "first_win",
								icon: "sword",
								name: "First Blood",
								description: "Win your first ranked match",
								labels: [],
								unlockedAt: "2026-09-01T10:00:00.000Z",
								season: 7,
								earnedPoints: 0,
							},
						],
						progress: {
							rankedWins: 34,
							rankedMatches: 55,
							currentStreak: 2,
							hasRankedWinByLadder: {
								TCG: true,
								OCG: false,
								Edison: true,
								JTP: false,
								Genesys: false,
							},
						},
					}),
					...errorResponses(404, 422),
				},
			},
			params: t.Object({ userId: t.String() }),
			response: { 200: UserAchievementRecordSchema },
		},
	);

export const userAchievementsRouter = createUserAchievementsRouter({
	getRecord: new GetUserAchievementRecord(new UserAchievementRecordPostgresRepository()),
});
