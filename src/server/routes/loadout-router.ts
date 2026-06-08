import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { CosmeticType } from "../../modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { EntitlementsGatekeeper } from "../../modules/entitlements/application/EntitlementsGatekeeper";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { EquipCosmetic } from "../../modules/loadout/application/EquipCosmetic";
import { GetMyLoadout } from "../../modules/loadout/application/GetMyLoadout";
import { LoadoutPostgresRepository } from "../../modules/loadout/infrastructure/LoadoutPostgresRepository";
import { JWT } from "../../shared/JWT";

const jwt = new JWT(config.jwt);
const cosmetics = new CosmeticPostgresRepository();
const loadouts = new LoadoutPostgresRepository();
const gatekeeper = new EntitlementsGatekeeper(new EntitlementPostgresRepository());

const getMyLoadout = new GetMyLoadout(loadouts, cosmetics, createR2AssetUrlSigner());
const equipCosmetic = new EquipCosmetic(cosmetics, loadouts, gatekeeper);

export const loadoutRouter = new Elysia({ prefix: "/me/loadout" })
	.use(bearer())
	.get(
		"/",
		({ bearer }) => {
			const { id } = jwt.decode(bearer as string) as { id: string };
			return getMyLoadout.run(id);
		},
		{
			detail: {
				tags: ["Cosmetics"],
				summary: "Get my loadout",
				description: "Returns the authenticated user's equipped cosmetics with signed asset URLs.",
				security: [{ bearerAuth: [] }],
			},
		},
	)
	.put(
		"/",
		async ({ bearer, body }) => {
			const { id } = jwt.decode(bearer as string) as { id: string };
			await equipCosmetic.run({
				userId: id,
				cosmeticType: body.cosmeticType,
				cosmeticId: body.cosmeticId,
			});
			return getMyLoadout.run(id);
		},
		{
			body: t.Object({
				cosmeticType: t.Enum(CosmeticType),
				cosmeticId: t.String(),
			}),
			detail: {
				tags: ["Cosmetics"],
				summary: "Equip a cosmetic",
				description: "Equips a cosmetic in its slot after validating the user is entitled to it.",
				security: [{ bearerAuth: [] }],
			},
		},
	);
