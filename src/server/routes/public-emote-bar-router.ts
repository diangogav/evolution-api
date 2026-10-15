import { Elysia } from "elysia";

import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { GetMyEmoteBar } from "../../modules/emote-bar/application/GetMyEmoteBar";
import { GetPublicEmoteBar } from "../../modules/emote-bar/application/GetPublicEmoteBar";
import { EmoteBarPostgresRepository } from "../../modules/emote-bar/infrastructure/EmoteBarPostgresRepository";
import { EmoteBarSchema } from "../../modules/emote-bar/infrastructure/EmoteBarSchemas";
import { EntitlementsGatekeeper } from "../../modules/entitlements/application/EntitlementsGatekeeper";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { UserDirectoryPostgresRepository } from "../../modules/loadout/infrastructure/UserDirectoryPostgresRepository";
import { errorResponses, jsonOk } from "../openapi/responses";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

const getMyEmoteBar = new GetMyEmoteBar(
	new CosmeticPostgresRepository(),
	new EmoteBarPostgresRepository(),
	new EntitlementsGatekeeper(new EntitlementPostgresRepository()),
	createR2AssetUrlSigner(),
);
const getPublicEmoteBar = new GetPublicEmoteBar(
	new UserDirectoryPostgresRepository(),
	getMyEmoteBar,
);

export const publicEmoteBarRouter = new Elysia().get(
	"/users/by-username/:username/emote-bar",
	({ params, set }) => {
		preventSignedAssetResponseCaching(set);
		return getPublicEmoteBar.run(params.username);
	},
	{
		detail: {
			tags: ["Cosmetics"],
			summary: "Get a user's public emote bar by username",
			description:
				"Public, read-only emote bar of a player addressed by username, with signed asset URLs, so a client can play the opponent's pack emotes. Returns 404 if the username does not exist.",
			responses: {
				200: jsonOk(EmoteBarSchema, "Emote bar retrieved successfully", {
					slots: [
						{
							ref: "halloween-duelist/ghost-wave",
							packId: "cosmetic-1",
							assetUrl:
								"https://assets.evolutionygo.com/emote-packs/halloween-duelist/ghost-wave.json?sig=...",
							packUrl:
								"https://assets.evolutionygo.com/emote-packs/halloween-duelist/pack.json?sig=...",
							assetsExpiresAt: "2026-09-25T18:30:00.000Z",
						},
						{ ref: "thumbsup", packId: null, assetUrl: null, packUrl: null, assetsExpiresAt: null },
					],
				}),
				...errorResponses(404),
			},
		},
	},
);
