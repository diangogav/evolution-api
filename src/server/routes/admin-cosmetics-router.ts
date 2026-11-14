import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import type { AssetUrlSigner } from "../../modules/catalog/domain/AssetUrlSigner";
import { createCatalogChangeNotifier } from "../../modules/assets/infrastructure/createCatalogChangeNotifier";
import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { createR2CosmeticAssetStorage } from "../../modules/assets/infrastructure/createR2CosmeticAssetStorage";
import { GetAdminCosmetics } from "../../modules/catalog/application/GetAdminCosmetics";
import { PublishCosmetic } from "../../modules/catalog/application/PublishCosmetic";
import { SetCosmeticPreview } from "../../modules/catalog/application/SetCosmeticPreview";
import { UpdateCosmetic } from "../../modules/catalog/application/UpdateCosmetic";
import { MAX_ESSENCE_PRICE } from "../../modules/catalog/domain/Cosmetic";
import { MAX_PREVIEW_BYTES } from "../../modules/catalog/domain/CosmeticPreview";
import type { CosmeticRepository } from "../../modules/catalog/domain/CosmeticRepository";
import type { CosmeticUsageSource } from "../../modules/catalog/domain/CosmeticUsageSource";
import { CosmeticTier } from "../../modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import {
	AdminCosmeticCatalogSchema,
	PublishedCosmeticSchema,
} from "../../modules/catalog/infrastructure/CosmeticSchemas";
import { EventCatalogPostgresRepository } from "../../modules/event-run/infrastructure/EventCatalogPostgresRepository";
import { BotLoadoutPostgresRepository } from "../../modules/loadout/infrastructure/BotLoadoutPostgresRepository";
import { buildCosmeticUsage } from "../composition/buildCosmeticUsage";
import { GrantCosmeticToUser } from "../../modules/entitlements/application/GrantCosmeticToUser";
import type { EntitlementRepository } from "../../modules/entitlements/domain/EntitlementRepository";
import { EntitlementSource } from "../../modules/entitlements/domain/EntitlementSource";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { CosmeticGrantSchema } from "../../modules/entitlements/infrastructure/GrantSchemas";
import type { UserDirectory } from "../../modules/user/domain/UserDirectory";
import { UserDirectoryPostgresRepository } from "../../modules/user/infrastructure/UserDirectoryPostgresRepository";
import { errorResponses, jsonOk } from "../openapi/responses";
import { Pino } from "../../shared/logger/infrastructure/Pino";
import { type AdminAuthorizer, adminAuthorizer } from "../auth/AdminAuthorizer";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

export interface AdminCosmeticsRouterDependencies {
	readonly authorizer: AdminAuthorizer;
	readonly cosmetics: CosmeticRepository;
	readonly signer: AssetUrlSigner;
	readonly publish: PublishCosmetic;
	readonly usage?: CosmeticUsageSource;
	readonly setPreview: Pick<SetCosmeticPreview, "run">;
	readonly update: Pick<UpdateCosmetic, "run">;
	readonly entitlements: EntitlementRepository;
	readonly users: UserDirectory;
}

export function createAdminCosmeticsRouter(deps: AdminCosmeticsRouterDependencies) {
	const list = new GetAdminCosmetics(deps.cosmetics, deps.signer, deps.usage);
	const grant = new GrantCosmeticToUser(deps.cosmetics, deps.entitlements, deps.users);

	return new Elysia({ prefix: "/admin/cosmetics" })
		.use(bearer())
		.get(
			"/",
			({ bearer: token, set }) => {
				deps.authorizer.requireAdmin(token);
				preventSignedAssetResponseCaching(set);
				return list.run();
			},
			{
				detail: {
					tags: ["Cosmetics Admin"],
					summary: "List every cosmetic for backoffice administration",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(AdminCosmeticCatalogSchema, "Catalog retrieved successfully", [
							{
								id: "4244bc19-0f5c-4e13-b260-137fd178ff2d",
								type: "PLAYMAT",
								tier: "EXCLUSIVE",
								assetRef: "playmats/magma-forge/",
								displayName: "Magma Forge",
								active: true,
								assetFiles: ["background.webp"],
								essencePrice: null,
								bots: ["Lich"],
								prizeOf: [{ eventId: "halloween-2026", name: "Halloween Gauntlet" }],
								assets: {
									"background.webp":
										"https://assets.evolutionygo.com/playmats/magma-forge/background.webp?sig=...",
								},
								assetsExpiresAt: "2026-09-25T18:30:00.000Z",
							},
						]),
						...errorResponses(401, 403),
					},
				},
			},
		)
		.post(
			"/",
			async ({ bearer: token, body }) => {
				deps.authorizer.requireAdmin(token);
				return deps.publish.run({
					type: body.type,
					tier: body.tier,
					assetRef: body.assetRef,
					displayName: body.displayName,
					essencePrice: body.essencePrice,
					files: await Promise.all(
						body.files.map(async (file) => ({
							name: file.name,
							bytes: new Uint8Array(await file.arrayBuffer()),
						})),
					),
				});
			},
			{
				body: t.Object({
					type: t.Enum(CosmeticType),
					tier: t.Enum(CosmeticTier),
					assetRef: t.String({ minLength: 1, maxLength: 180 }),
					displayName: t.String({ minLength: 1, maxLength: 80 }),
					essencePrice: t.Optional(t.Numeric({ minimum: 1, maximum: MAX_ESSENCE_PRICE })),
					files: t.Files({ minItems: 1, maxItems: 200, maxSize: "12m" }),
				}),
				detail: {
					tags: ["Cosmetics Admin"],
					summary: "Upload and publish a cosmetic atomically",
					description:
						"EMOTE_PACK, LANE and AMBIENCE may also carry a preview.jpg (a JPEG of at most 512 KB), the picture shown where the cosmetic appears as one piece. essencePrice puts the cosmetic in the shop at that price in essence and is only accepted for DONOR and EXCLUSIVE; without it the cosmetic is not for sale. Each file is stored under the assetRef by its multipart file name. Per-type rules apply: most types take up to 8 flat file names (13 for EMOTE_PACK). A CARD_FRAME kit takes up to 200 files: layout.json, preview.webp and .png layers, whose file names may carry the kit-relative path with up to two lowercase folders (frame/normal.png, digits/1.png). All files together stay under 25 MB.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(PublishedCosmeticSchema, "Cosmetic published successfully", {
							id: "4244bc19-0f5c-4e13-b260-137fd178ff2d",
							type: "LANE",
							tier: "STANDARD",
							assetRef: "lanes/bronze/",
							displayName: "Bronce",
							active: true,
							assetFiles: ["plate.json"],
							essencePrice: null,
						}),
						...errorResponses(400, 401, 403, 409, 422),
					},
				},
			},
		)
		.put(
			"/:id",
			async ({ bearer: token, params, body }) => {
				deps.authorizer.requireAdmin(token);
				return deps.update.run({
					cosmeticId: params.id,
					tier: body.tier,
					displayName: body.displayName,
					essencePrice: body.essencePrice,
					files: await Promise.all(
						(body.files ?? []).map(async (file) => ({
							name: file.name,
							bytes: new Uint8Array(await file.arrayBuffer()),
						})),
					),
				});
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					tier: t.Enum(CosmeticTier),
					displayName: t.String({ minLength: 1, maxLength: 80 }),
					essencePrice: t.Optional(t.Numeric({ minimum: 1, maximum: MAX_ESSENCE_PRICE })),
					files: t.Optional(t.Files({ maxItems: 200, maxSize: "12m" })),
				}),
				detail: {
					tags: ["Cosmetics Admin"],
					summary: "Update a published cosmetic",
					description:
						"States the whole cosmetic, so sending the same request twice leaves the same result. tier and displayName replace the current ones. essencePrice puts the cosmetic in the shop at that price and is only accepted for DONOR and EXCLUSIVE; leaving it out takes the cosmetic out of the shop. files is optional: when sent, the files replace the folder's under the same rules as a publication, and the ones no longer named are removed; when left out, the files stay. The type and the assetRef cannot change. Lowering who holds a cosmetic by tier takes it away from players who had it through their tier.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(PublishedCosmeticSchema, "Cosmetic updated successfully", {
							id: "4244bc19-0f5c-4e13-b260-137fd178ff2d",
							type: "AVATAR",
							tier: "EXCLUSIVE",
							assetRef: "avatars/frog-mage/",
							displayName: "Frog Mage",
							active: true,
							assetFiles: ["render.jpg", "preview.jpg"],
							essencePrice: 800,
						}),
						...errorResponses(400, 401, 403, 404, 422),
					},
				},
			},
		)
		.put(
			"/:id/preview",
			async ({ bearer: token, params, body }) => {
				deps.authorizer.requireAdmin(token);
				return deps.setPreview.run({
					cosmeticId: params.id,
					bytes: new Uint8Array(await body.file.arrayBuffer()),
				});
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({ file: t.File({ maxSize: MAX_PREVIEW_BYTES }) }),
				detail: {
					tags: ["Cosmetics Admin"],
					summary: "Set the preview image of a published cosmetic",
					description:
						"Stores the file as preview.jpg in the cosmetic's folder, replacing the one it has, and records it among its files. Only for the types the client draws from data alone and that have no image of their own: EMOTE_PACK, LANE and AMBIENCE. The file must be a JPEG of at most 512 KB.",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(PublishedCosmeticSchema, "Preview stored successfully", {
							id: "4244bc19-0f5c-4e13-b260-137fd178ff2d",
							type: "LANE",
							tier: "STANDARD",
							assetRef: "lanes/bronze/",
							displayName: "Bronce",
							active: true,
							assetFiles: ["plate.json", "preview.jpg"],
							essencePrice: null,
						}),
						...errorResponses(400, 401, 403, 404, 422),
					},
				},
			},
		)
		.post(
			"/:id/grants",
			async ({ bearer: token, params, body }) => {
				deps.authorizer.requireAdmin(token);
				return grant.run({
					cosmeticId: params.id,
					username: body.username,
					source: body.source,
				});
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					username: t.String({ minLength: 1, maxLength: 14 }),
					source: t.Enum(EntitlementSource),
				}),
				detail: {
					tags: ["Cosmetics Admin"],
					summary: "Grant a cosmetic to one user",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(CosmeticGrantSchema, "Cosmetic granted successfully", {
							cosmeticId: "4244bc19-0f5c-4e13-b260-137fd178ff2d",
							userId: "user-1",
							username: "Diango",
							source: "CAMPAIGN",
							created: true,
						}),
						...errorResponses(401, 403, 404, 422),
					},
				},
			},
		);
}

const cosmetics = new CosmeticPostgresRepository();
const storage = createR2CosmeticAssetStorage();
const catalogChange = createCatalogChangeNotifier(cosmetics, new Pino());

export const adminCosmeticsRouter = createAdminCosmeticsRouter({
	authorizer: adminAuthorizer,
	cosmetics,
	signer: createR2AssetUrlSigner(),
	usage: buildCosmeticUsage(
		new BotLoadoutPostgresRepository(),
		new EventCatalogPostgresRepository(),
	),
	publish: new PublishCosmetic(cosmetics, storage, catalogChange),
	setPreview: new SetCosmeticPreview(cosmetics, storage, catalogChange),
	update: new UpdateCosmetic(cosmetics, storage, catalogChange),
	entitlements: new EntitlementPostgresRepository(),
	users: new UserDirectoryPostgresRepository(),
});
