import { Elysia } from "elysia";

import { GetAchievementCatalog } from "../../modules/achievements/application/GetAchievementCatalog";
import { AchievementCatalogPostgresRepository } from "../../modules/achievements/infrastructure/AchievementCatalogPostgresRepository";
import { AchievementCatalogSchema } from "../../modules/achievements/infrastructure/AchievementsSchemas";
import { emptyOk, jsonOk } from "../openapi/responses";

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
