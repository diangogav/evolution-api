import { Elysia, t } from "elysia";

import { requireUser } from "../auth/requireUser";
import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { CosmeticType } from "../../modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { EntitlementsGatekeeper } from "../../modules/entitlements/application/EntitlementsGatekeeper";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { EquipCosmetic } from "../../modules/loadout/application/EquipCosmetic";
import { GetMyLoadout } from "../../modules/loadout/application/GetMyLoadout";
import { LoadoutSchema } from "../../modules/loadout/infrastructure/LoadoutSchemas";
import { LoadoutPostgresRepository } from "../../modules/loadout/infrastructure/LoadoutPostgresRepository";
import { errorResponses, jsonOk } from "../openapi/responses";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

const cosmetics = new CosmeticPostgresRepository();
const loadouts = new LoadoutPostgresRepository();
const gatekeeper = new EntitlementsGatekeeper(new EntitlementPostgresRepository());

const getMyLoadout = new GetMyLoadout(loadouts, cosmetics, createR2AssetUrlSigner());
const equipCosmetic = new EquipCosmetic(cosmetics, loadouts, gatekeeper);

export const loadoutRouter = new Elysia({ prefix: "/me/loadout" }).guard({}, (app) =>
	app
		.use(requireUser)
		.get(
			"/",
			({ userId, set }) => {
				preventSignedAssetResponseCaching(set);
				return getMyLoadout.run(userId);
			},
			{
				detail: {
					tags: ["Cosmetics"],
					summary: "Get my loadout",
					description:
						"Returns the authenticated user's equipped cosmetics with signed asset URLs.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(LoadoutSchema, "Loadout retrieved successfully", [
							{
								cosmeticType: "SLEEVE",
								cosmeticId: "cosmetic-1",
								assets: {
									"render.jpg":
										"https://assets.evolutionygo.com/sleeves/baby-frog/render.jpg?sig=...",
								},
								assetsExpiresAt: "2026-09-25T18:30:00.000Z",
							},
						]),
						...errorResponses(401, 403),
					},
				},
			},
		)
		.put(
			"/",
			async ({ userId, body, set }) => {
				preventSignedAssetResponseCaching(set);
				await equipCosmetic.run({
					userId,
					cosmeticType: body.cosmeticType,
					cosmeticId: body.cosmeticId,
				});
				return getMyLoadout.run(userId);
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
					responses: {
						200: jsonOk(LoadoutSchema, "Loadout retrieved successfully after equipping", [
							{
								cosmeticType: "SLEEVE",
								cosmeticId: "cosmetic-1",
								assets: {
									"render.jpg":
										"https://assets.evolutionygo.com/sleeves/baby-frog/render.jpg?sig=...",
								},
								assetsExpiresAt: "2026-09-25T18:30:00.000Z",
							},
						]),
						...errorResponses(400, 401, 403, 404, 422),
					},
				},
			},
		),
);
