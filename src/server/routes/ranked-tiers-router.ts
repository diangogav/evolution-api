import { Elysia, t } from "elysia";

import { GetTierCatalog } from "../../modules/tiers/application/GetTierCatalog";
import { RankedTierCatalogSchema } from "../../modules/tiers/infrastructure/TierSchemas";
import { jsonOk } from "../openapi/responses";

const getTierCatalog = new GetTierCatalog();

export const rankedTiersRouter = new Elysia({ prefix: "/ranked-tiers" }).get(
	"/",
	({ query }) => getTierCatalog.run(query.banListName),
	{
		detail: {
			tags: ["Leaderboard"],
			summary: "Get the ranked tier catalog",
			description:
				"Retrieves the seven-level ranked tier ladder (Rookie to Master) with display names, icon names, effective-point thresholds and gating rules, so clients never hardcode ladder values. Pass banListName to receive the ladder that rank plays under, with its overrides already applied; without it, or for an unknown rank, the default ladder is returned. Public: no credentials required.",
			responses: {
				200: jsonOk(
					RankedTierCatalogSchema,
					"Tier catalog retrieved successfully",
					// The catalog is a compile-time constant, so the live default ladder
					// is the example.
					getTierCatalog.run("TCG"),
				),
			},
		},
		query: t.Object({
			banListName: t.Optional(
				t.String({ description: "Rank name whose effective ladder is wanted" }),
			),
		}),
		response: { 200: RankedTierCatalogSchema },
	},
);
