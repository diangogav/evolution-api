import { Elysia, t } from "elysia";

import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { GetCosmeticsCatalog } from "../../modules/catalog/application/GetCosmeticsCatalog";
import { CosmeticTier } from "../../modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { EntitlementsGatekeeper } from "../../modules/entitlements/application/EntitlementsGatekeeper";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";

const gatekeeper = new EntitlementsGatekeeper(new EntitlementPostgresRepository());

const getCosmeticsCatalog = new GetCosmeticsCatalog(
	new CosmeticPostgresRepository(),
	createR2AssetUrlSigner(),
	gatekeeper,
);

export const cosmeticsRouter = new Elysia({ prefix: "/cosmetics" }).get(
	"/",
	({ query }) => getCosmeticsCatalog.run({ type: query.type, tier: query.tier }, null),
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
		},
	},
);
