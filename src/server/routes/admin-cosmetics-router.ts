import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import type { AssetUrlSigner } from "../../modules/assets/domain/AssetUrlSigner";
import { createR2AssetUrlSigner } from "../../modules/assets/infrastructure/createR2AssetUrlSigner";
import { createR2CosmeticAssetStorage } from "../../modules/assets/infrastructure/createR2CosmeticAssetStorage";
import { GetAdminCosmetics } from "../../modules/catalog/application/GetAdminCosmetics";
import { ConfigureCompanionAnimation } from "../../modules/catalog/application/ConfigureCompanionAnimation";
import { PublishCosmetic } from "../../modules/catalog/application/PublishCosmetic";
import { ReplaceCompanionModel } from "../../modules/catalog/application/ReplaceCompanionModel";
import type { CompanionAnimationDescriptor } from "../../modules/catalog/domain/CompanionAnimation";
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
import { InvalidArgumentError } from "../../shared/errors/InvalidArgumentError";
import { JWT } from "../../shared/JWT";
import type { AdminAuthorizer } from "../auth/AdminAuthorizer";
import { JwtAdminAuthorizer } from "../auth/AdminAuthorizer";
import { preventSignedAssetResponseCaching } from "./signed-asset-response";

export interface AdminCosmeticsRouterDependencies {
	readonly authorizer: AdminAuthorizer;
	readonly cosmetics: CosmeticRepository;
	readonly signer: AssetUrlSigner;
	readonly publish: PublishCosmetic;
	readonly replaceCompanionModel: ReplaceCompanionModel;
	readonly entitlements: EntitlementRepository;
	readonly users: UserDirectory;
}

function parseAnimation(
	raw: string | CompanionAnimationDescriptor | undefined,
): CompanionAnimationDescriptor | undefined {
	if (raw === undefined) return undefined;
	if (typeof raw === "object") return raw;
	if (!raw.trim()) return undefined;
	try {
		const parsed = JSON.parse(raw) as CompanionAnimationDescriptor;
		if (!parsed || typeof parsed !== "object") throw new Error("not an object");
		return parsed;
	} catch {
		throw new InvalidArgumentError("animation must be valid JSON");
	}
}

const companionAnimationSchema = t.Object({
	rigFile: t.Optional(t.String({ minLength: 1, maxLength: 180 })),
	targetHeight: t.Optional(t.Number({ minimum: 0.25, maximum: 4 })),
	orientationOffsetY: t.Optional(t.Number({ minimum: -Math.PI * 2, maximum: Math.PI * 2 })),
	clips: t.Optional(
		t.Partial(
			t.Object({
				idle: t.String(),
				spawn: t.String(),
				speak: t.String(),
				hit: t.String(),
				summon: t.String(),
				attack: t.String(),
				cast: t.String(),
				victory: t.String(),
				defeat: t.String(),
			}),
		),
	),
	motion: t.Optional(
		t.Object({
			preset: t.Union([
				t.Literal("grounded"),
				t.Literal("hover"),
				t.Literal("serpentine"),
				t.Literal("bouncy"),
			]),
			intensity: t.Optional(t.Number({ minimum: 0.25, maximum: 2 })),
			speed: t.Optional(t.Number({ minimum: 0.5, maximum: 2 })),
		}),
	),
});

export function createAdminCosmeticsRouter(deps: AdminCosmeticsRouterDependencies) {
	const list = new GetAdminCosmetics(deps.cosmetics, deps.signer);
	const configureAnimation = new ConfigureCompanionAnimation(deps.cosmetics);
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
					animation: parseAnimation(body.animation),
				});
			},
			{
				body: t.Object({
					type: t.Enum(CosmeticType),
					tier: t.Enum(CosmeticTier),
					assetRef: t.String({ minLength: 1, maxLength: 180 }),
					displayName: t.String({ minLength: 1, maxLength: 80 }),
					animation: t.Optional(
						t.Union([t.String({ maxLength: 8_000 }), companionAnimationSchema]),
					),
					files: t.Files({ minItems: 1, maxItems: 8, maxSize: "12m" }),
				}),
				detail: {
					tags: ["Cosmetics Admin"],
					summary: "Upload and publish a cosmetic atomically",
					security: [{ bearerAuth: [] }],
				},
			},
		)
		.patch(
			"/:id/animation",
			({ bearer: token, params, body }) => {
				deps.authorizer.requireAdmin(token);
				return configureAnimation.run({
					cosmeticId: params.id,
					animation: body.animation ?? undefined,
				});
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					animation: t.Union([t.Null(), companionAnimationSchema]),
				}),
				detail: {
					tags: ["Cosmetics Admin"],
					summary: "Configure one companion animation profile",
					security: [{ bearerAuth: [] }],
				},
			},
		)
		.put(
			"/:id/model",
			async ({ bearer: token, params, body }) => {
				deps.authorizer.requireAdmin(token);
				return deps.replaceCompanionModel.run({
					cosmeticId: params.id,
					file: {
						name: body.file.name,
						bytes: new Uint8Array(await body.file.arrayBuffer()),
					},
					animation: parseAnimation(body.animation),
				});
			},
			{
				params: t.Object({ id: t.String() }),
				body: t.Object({
					file: t.File({ maxSize: "12m" }),
					animation: t.Optional(
						t.Union([t.String({ maxLength: 8_000 }), companionAnimationSchema]),
					),
				}),
				detail: {
					tags: ["Cosmetics Admin"],
					summary: "Replace one companion model while preserving its catalog identity",
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
	replaceCompanionModel: new ReplaceCompanionModel(cosmetics, storage),
	entitlements: new EntitlementPostgresRepository(),
	users: new UserDirectoryPostgresRepository(),
});
