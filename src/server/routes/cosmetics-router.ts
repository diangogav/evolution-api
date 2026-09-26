import { Elysia, t } from "elysia";

import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { GetCosmeticAssets } from "../../modules/catalog/application/GetCosmeticAssets";
import { GetCosmeticsCatalog } from "../../modules/catalog/application/GetCosmeticsCatalog";
import { CosmeticTier } from "../../modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../modules/catalog/domain/CosmeticType";
import {
	CosmeticAssetsSchema,
	CosmeticCatalogSchema,
} from "../../modules/catalog/infrastructure/CosmeticSchemas";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { EntitlementsGatekeeper } from "../../modules/entitlements/application/EntitlementsGatekeeper";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { errorResponses, jsonOk } from "../openapi/responses";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

const gatekeeper = new EntitlementsGatekeeper(new EntitlementPostgresRepository());

const getCosmeticsCatalog = new GetCosmeticsCatalog(
	new CosmeticPostgresRepository(),
	createR2AssetUrlSigner(),
	gatekeeper,
);
const getCosmeticAssets = new GetCosmeticAssets(
	new CosmeticPostgresRepository(),
	createR2AssetUrlSigner(),
	gatekeeper,
);

export const cosmeticsRouter = new Elysia({ prefix: "/cosmetics" })
	.get(
		"/",
		({ query, set }) => {
			preventSignedAssetResponseCaching(set);
			return getCosmeticsCatalog.run({ type: query.type, tier: query.tier }, null);
		},
		{
			query: t.Object({
				type: t.Optional(t.Enum(CosmeticType)),
				tier: t.Optional(t.Enum(CosmeticTier)),
			}),
			detail: {
				tags: ["Cosmetics"],
				summary: "List the cosmetics catalog",
				description:
					"Public catalog of cosmetics (STANDARD tier only). Filterable by type and tier. Each item includes a manifest of short-lived signed URLs, one per asset file under the cosmetic's storage prefix.",
				responses: {
					200: jsonOk(CosmeticCatalogSchema, "Catalog retrieved successfully", [
						{
							id: "playmats-arcane",
							type: "PLAYMAT",
							tier: "STANDARD",
							displayName: "Salón arcano",
							assets: {
								"surface.webp":
									"https://assets.evolutionygo.com/playmats/arcane/surface.webp?sig=...",
							},
							assetsExpiresAt: "2026-09-25T18:30:00.000Z",
						},
					]),
					...errorResponses(422),
				},
			},
		},
	)
	.get(
		"/:id/assets",
		({ params, set }) => {
			preventSignedAssetResponseCaching(set);
			return getCosmeticAssets.run(params.id, null);
		},
		{
			params: t.Object({ id: t.String() }),
			detail: {
				tags: ["Cosmetics"],
				summary: "Refresh one public cosmetic asset manifest",
				description:
					"Returns fresh signed URLs only for the requested STANDARD cosmetic, without reloading the catalog.",
				responses: {
					200: jsonOk(CosmeticAssetsSchema, "Asset manifest refreshed successfully", {
						assets: {
							"surface.webp":
								"https://assets.evolutionygo.com/playmats/arcane/surface.webp?sig=...",
						},
						assetsExpiresAt: "2026-09-25T18:30:00.000Z",
					}),
					...errorResponses(404, 422),
				},
			},
		},
	);
