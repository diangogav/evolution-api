import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { GetCosmeticAssets } from "../../modules/catalog/application/GetCosmeticAssets";
import { GetCosmeticsCatalog } from "../../modules/catalog/application/GetCosmeticsCatalog";
import { CosmeticTier } from "../../modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { EntitlementsGatekeeper } from "../../modules/entitlements/application/EntitlementsGatekeeper";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { JWT } from "../../shared/JWT";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

const jwt = new JWT(config.jwt);
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

export const meCosmeticsRouter = new Elysia({ prefix: "/me/cosmetics" })
	.use(bearer())
	.get(
		"/",
		({ bearer, query, set }) => {
			preventSignedAssetResponseCaching(set);
			const { id } = jwt.decode(bearer as string) as { id: string };
			return getCosmeticsCatalog.run({ type: query.type, tier: query.tier }, id);
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
			},
		},
	)
	.get(
		"/:id/assets",
		({ bearer, params, set }) => {
			preventSignedAssetResponseCaching(set);
			const { id: userId } = jwt.decode(bearer as string) as { id: string };
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
			},
		},
	);
