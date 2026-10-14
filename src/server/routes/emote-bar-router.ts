import { bearer } from "@elysiajs/bearer";
import { Elysia } from "elysia";

import { config } from "../../config";
import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { GetMyEmoteBar } from "../../modules/emote-bar/application/GetMyEmoteBar";
import { SaveMyEmoteBar } from "../../modules/emote-bar/application/SaveMyEmoteBar";
import { EmoteBarPostgresRepository } from "../../modules/emote-bar/infrastructure/EmoteBarPostgresRepository";
import {
	EmoteBarSchema,
	SaveEmoteBarBodySchema,
} from "../../modules/emote-bar/infrastructure/EmoteBarSchemas";
import { EntitlementsGatekeeper } from "../../modules/entitlements/application/EntitlementsGatekeeper";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { JWT } from "../../shared/JWT";
import { banGuard } from "../guards/bandGuard";
import { errorResponses, jsonOk } from "../openapi/responses";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

const jwt = new JWT(config.jwt);
const cosmetics = new CosmeticPostgresRepository();
const bars = new EmoteBarPostgresRepository();
const gatekeeper = new EntitlementsGatekeeper(new EntitlementPostgresRepository());

const getMyEmoteBar = new GetMyEmoteBar(cosmetics, bars, gatekeeper, createR2AssetUrlSigner());
const saveMyEmoteBar = new SaveMyEmoteBar(cosmetics, bars, gatekeeper);

const exampleBar = {
	slots: [
		{
			ref: "halloween-duelist/ghost-wave",
			packId: "cosmetic-1",
			assetUrl:
				"https://assets.evolutionygo.com/emote-packs/halloween-duelist/ghost-wave.json?sig=...",
			packUrl: "https://assets.evolutionygo.com/emote-packs/halloween-duelist/pack.json?sig=...",
			assetsExpiresAt: "2026-09-25T18:30:00.000Z",
		},
		{ ref: "thumbsup", packId: null, assetUrl: null, packUrl: null, assetsExpiresAt: null },
	],
};

export const emoteBarRouter = new Elysia({ prefix: "/me/emote-bar" })
	.use(bearer())
	.guard(banGuard, (app) =>
		app
			.get(
				"/",
				({ bearer, set }) => {
					preventSignedAssetResponseCaching(set);
					const { id } = jwt.decode(bearer as string) as { id: string };
					return getMyEmoteBar.run(id);
				},
				{
					detail: {
						tags: ["Cosmetics"],
						summary: "Get my emote bar",
						description:
							"Returns the authenticated user's 8 emote slots. Without a saved bar these are the default emotes. A saved pack emote the user can no longer use reads as the default emote of its slot.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(EmoteBarSchema, "Emote bar retrieved successfully", exampleBar),
							...errorResponses(401, 403),
						},
					},
				},
			)
			.put(
				"/",
				async ({ bearer, body, set }) => {
					preventSignedAssetResponseCaching(set);
					const { id } = jwt.decode(bearer as string) as { id: string };
					await saveMyEmoteBar.run({ userId: id, slots: body.slots });
					return getMyEmoteBar.run(id);
				},
				{
					body: SaveEmoteBarBodySchema,
					detail: {
						tags: ["Cosmetics"],
						summary: "Save my emote bar",
						description:
							"Replaces the whole bar after validating every emote: default ids are always allowed; a pack emote needs an active EMOTE_PACK the user can use that lists the emote.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(EmoteBarSchema, "Emote bar saved", exampleBar),
							...errorResponses(400, 401, 403, 422),
						},
					},
				},
			),
	);
