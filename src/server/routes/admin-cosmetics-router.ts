import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import type { AssetUrlSigner } from "../../modules/assets/domain/AssetUrlSigner";
import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { createR2CosmeticAssetStorage } from "../../modules/assets/infrastructure/createR2CosmeticAssetStorage";
import { GetAdminCosmetics } from "../../modules/catalog/application/GetAdminCosmetics";
import { PublishCosmetic } from "../../modules/catalog/application/PublishCosmetic";
import type { CosmeticRepository } from "../../modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { GrantCosmeticToUser } from "../../modules/entitlements/application/GrantCosmeticToUser";
import type { EntitlementRepository } from "../../modules/entitlements/domain/EntitlementRepository";
import { EntitlementSource } from "../../modules/entitlements/domain/EntitlementSource";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import type { UserDirectory } from "../../modules/loadout/domain/UserDirectory";
import { UserDirectoryPostgresRepository } from "../../modules/loadout/infrastructure/UserDirectoryPostgresRepository";
import { JWT } from "../../shared/JWT";
import type { AdminAuthorizer } from "../auth/AdminAuthorizer";
import { JwtAdminAuthorizer } from "../auth/AdminAuthorizer";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

export interface AdminCosmeticsRouterDependencies {
	readonly authorizer: AdminAuthorizer;
	readonly cosmetics: CosmeticRepository;
	readonly signer: AssetUrlSigner;
	readonly publish: PublishCosmetic;
	readonly entitlements: EntitlementRepository;
	readonly users: UserDirectory;
}

export function createAdminCosmeticsRouter(deps: AdminCosmeticsRouterDependencies) {
	const list = new GetAdminCosmetics(deps.cosmetics, deps.signer);
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
					files: t.Files({ minItems: 1, maxItems: 8, maxSize: "12m" }),
				}),
				detail: {
					tags: ["Cosmetics Admin"],
					summary: "Upload and publish a cosmetic atomically",
					security: [{ bearerAuth: [] }],
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
				},
			},
		);
}

const cosmetics = new CosmeticPostgresRepository();
const storage = createR2CosmeticAssetStorage();

export const adminCosmeticsRouter = createAdminCosmeticsRouter({
	authorizer: new JwtAdminAuthorizer(new JWT(config.jwt)),
	cosmetics,
	signer: createR2AssetUrlSigner(),
	publish: new PublishCosmetic(cosmetics, storage),
	entitlements: new EntitlementPostgresRepository(),
	users: new UserDirectoryPostgresRepository(),
});
