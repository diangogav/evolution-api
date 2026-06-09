import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { GetCosmeticsCatalog } from "../../modules/catalog/application/GetCosmeticsCatalog";
import { CosmeticTier } from "../../modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { EntitlementsGatekeeper } from "../../modules/entitlements/application/EntitlementsGatekeeper";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { JWT } from "../../shared/JWT";

const jwt = new JWT(config.jwt);
const gatekeeper = new EntitlementsGatekeeper(new EntitlementPostgresRepository());

const getCosmeticsCatalog = new GetCosmeticsCatalog(
	new CosmeticPostgresRepository(),
	createR2AssetUrlSigner(),
	gatekeeper,
);

export const meCosmeticsRouter = new Elysia({ prefix: "/me/cosmetics" })
	.use(bearer())
	.get(
		"/",
		({ bearer, query }) => {
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
	);
