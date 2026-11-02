import { Elysia, t } from "elysia";

import { requireUser } from "../auth/requireUser";
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

export const meCosmeticsRouter = new Elysia({ prefix: "/me/cosmetics" }).guard({}, (app) =>
	app
		.use(requireUser)
		.get(
			"/",
			({ userId, query, set }) => {
				preventSignedAssetResponseCaching(set);
				return getCosmeticsCatalog.run({ type: query.type, tier: query.tier }, userId);
			},
			{
				query: t.Object({
					type: t.Optional(t.Enum(CosmeticType)),
					tier: t.Optional(t.Enum(CosmeticTier)),
				}),
				detail: {
					tags: ["Cosmetics"],
					summary: "List my cosmetics catalog",
					description:
						"Personalized catalog of cosmetics visible to the authenticated user. Includes cosmetics covered by the user's tier or individual COSMETIC grants. Each item includes a manifest of short-lived signed URLs.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(CosmeticCatalogSchema, "Catalog retrieved successfully", [
							{
								id: "sleeves-baby-frog",
								type: "SLEEVE",
								tier: "REGISTERED",
								displayName: "Baby Frog",
								assets: {
									"render.jpg":
										"https://assets.evolutionygo.com/sleeves/baby-frog/render.jpg?sig=...",
								},
								assetsExpiresAt: "2026-09-25T18:30:00.000Z",
							},
						]),
						...errorResponses(401, 403, 422),
					},
				},
			},
		)
		.get(
			"/:id/assets",
			({ userId, params, set }) => {
				preventSignedAssetResponseCaching(set);
				return getCosmeticAssets.run(params.id, userId);
			},
			{
				params: t.Object({ id: t.String() }),
				detail: {
					tags: ["Cosmetics"],
					summary: "Refresh one entitled cosmetic asset manifest",
					description:
						"Returns fresh signed URLs only for the requested cosmetic after checking the user's current access.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(CosmeticAssetsSchema, "Asset manifest refreshed successfully", {
							assets: {
								"render.jpg":
									"https://assets.evolutionygo.com/sleeves/baby-frog/render.jpg?sig=...",
							},
							assetsExpiresAt: "2026-09-25T18:30:00.000Z",
						}),
						...errorResponses(401, 403, 404, 422),
					},
				},
			},
		),
);
