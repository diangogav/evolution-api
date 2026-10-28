import { Elysia, t } from "elysia";

import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { GetBotLoadout } from "../../modules/loadout/application/GetBotLoadout";
import { GetMyLoadout } from "../../modules/loadout/application/GetMyLoadout";
import { BotLoadoutPostgresRepository } from "../../modules/loadout/infrastructure/BotLoadoutPostgresRepository";
import { LoadoutSchema } from "../../modules/loadout/infrastructure/LoadoutSchemas";
import { LoadoutPostgresRepository } from "../../modules/loadout/infrastructure/LoadoutPostgresRepository";
import { errorResponses, jsonOk } from "../openapi/responses";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

const signedSlots = new GetMyLoadout(
	new LoadoutPostgresRepository(),
	new CosmeticPostgresRepository(),
	createR2AssetUrlSigner(),
);
const getBotLoadout = new GetBotLoadout(new BotLoadoutPostgresRepository(), signedSlots);

export const botLoadoutRouter = new Elysia().get(
	"/bots/:botName/loadout",
	({ params, set }) => {
		preventSignedAssetResponseCaching(set);
		return getBotLoadout.run(params.botName);
	},
	{
		params: t.Object({ botName: t.String({ minLength: 1, maxLength: 64 }) }),
		detail: {
			tags: ["Cosmetics"],
			summary: "Get a WindBot bot's loadout by bot name",
			description:
				"Public, read-only loadout of a WindBot bot addressed by its exact botlist name, with signed asset URLs. Same shape as a user's public loadout. An unknown bot, or one with nothing equipped, answers an empty array (client falls back to the standard look).",
			responses: {
				200: jsonOk(LoadoutSchema, "Loadout retrieved successfully", [
					{
						cosmeticType: "PLAYMAT",
						cosmeticId: "cosmetic-1",
						assets: {
							"render.jpg":
								"https://assets.evolutionygo.com/playmats/halloween-graveyard/render.jpg?sig=...",
						},
						assetsExpiresAt: "2026-10-28T18:30:00.000Z",
					},
				]),
				...errorResponses(422),
			},
		},
	},
);
