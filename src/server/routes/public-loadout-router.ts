import { Elysia } from "elysia";

import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { GetMyLoadout } from "../../modules/loadout/application/GetMyLoadout";
import { GetPublicLoadout } from "../../modules/loadout/application/GetPublicLoadout";
import { LoadoutSchema } from "../../modules/loadout/infrastructure/LoadoutSchemas";
import { LoadoutPostgresRepository } from "../../modules/loadout/infrastructure/LoadoutPostgresRepository";
import { UserDirectoryPostgresRepository } from "../../modules/loadout/infrastructure/UserDirectoryPostgresRepository";
import { errorResponses, jsonOk } from "../openapi/responses";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

const loadouts = new LoadoutPostgresRepository();
const cosmetics = new CosmeticPostgresRepository();
const getMyLoadout = new GetMyLoadout(loadouts, cosmetics, createR2AssetUrlSigner());
const getPublicLoadout = new GetPublicLoadout(new UserDirectoryPostgresRepository(), getMyLoadout);

export const publicLoadoutRouter = new Elysia().get(
	"/users/by-username/:username/loadout",
	({ params, set }) => {
		preventSignedAssetResponseCaching(set);
		return getPublicLoadout.run(params.username);
	},
	{
		detail: {
			tags: ["Cosmetics"],
			summary: "Get a user's public loadout by username",
			description:
				"Public, read-only loadout of a player addressed by username, with signed asset URLs. Returns 404 if the username does not exist (client falls back to the standard look).",
			responses: {
				200: jsonOk(LoadoutSchema, "Loadout retrieved successfully", [
					{
						cosmeticType: "SLEEVE",
						cosmeticId: "cosmetic-1",
						assets: {
							"render.jpg": "https://assets.evolutionygo.com/sleeves/baby-frog/render.jpg?sig=...",
						},
						assetsExpiresAt: "2026-09-25T18:30:00.000Z",
					},
				]),
				...errorResponses(404),
			},
		},
	},
);
