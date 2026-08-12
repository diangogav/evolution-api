import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import type { CosmeticAssetStorage } from "../../../../src/modules/assets/domain/CosmeticAssetStorage";
import type { AssetUrlSigner } from "../../../../src/modules/assets/domain/AssetUrlSigner";
import { PublishCosmetic } from "../../../../src/modules/catalog/application/PublishCosmetic";
import { ReplaceCompanionModel } from "../../../../src/modules/catalog/application/ReplaceCompanionModel";
import { Cosmetic } from "../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../src/modules/catalog/domain/CosmeticType";
import type { EntitlementRepository } from "../../../../src/modules/entitlements/domain/EntitlementRepository";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { createAdminCosmeticsRouter } from "../../../../src/server/routes/admin-cosmetics-router";

function buildApp(existingCosmetic: Cosmetic | null = null, onSave?: (cosmetic: Cosmetic) => void) {
	const cosmetics: CosmeticRepository = {
		findAll: async () => (existingCosmetic ? [existingCosmetic] : []),
		findById: async () => existingCosmetic,
		save: async (cosmetic) => onSave?.(cosmetic),
	};
	const uploaded: string[] = [];
	const deleted: string[] = [];
	const storage: CosmeticAssetStorage = {
		put: async (upload) => {
			uploaded.push(upload.key);
		},
		delete: async (key) => {
			deleted.push(key);
		},
	};
	const signer: AssetUrlSigner = {
		sign: (assetRef) => `https://r2.test/${assetRef}`,
		signMany: (assetRefs) =>
			Object.fromEntries(assetRefs.map((assetRef) => [assetRef, `https://r2.test/${assetRef}`])),
		signManifest: async () => ({ assets: {}, expiresAt: "2026-08-11T20:00:00.000Z" }),
	};
	const entitlements: EntitlementRepository = {
		findByUserId: async () => [],
		save: async () => undefined,
	};
	return new Elysia()
		.onError(({ error, set }) => {
			if (error instanceof AuthenticationError) set.status = 401;
			if (error instanceof ForbiddenError) set.status = 403;
		})
		.use(
			createAdminCosmeticsRouter({
				authorizer: {
					requireAdmin: (token) => {
						if (!token) throw new AuthenticationError("missing");
						if (token !== "admin-token") throw new ForbiddenError("admin required");
						return { userId: "admin-1" };
					},
				},
				cosmetics,
				signer,
				publish: new PublishCosmetic(cosmetics, storage),
				replaceCompanionModel: new ReplaceCompanionModel(cosmetics, storage, () => "abc12345"),
				entitlements,
				users: { findUserIdByUsername: async () => null },
			}),
		);
}

describe("admin cosmetics routes", () => {
	it("rejects an unauthenticated catalog request", async () => {
		const response = await buildApp().handle(new Request("http://localhost/admin/cosmetics/"));
		expect(response.status).toBe(401);
	});

	it("rejects a non-admin bearer token", async () => {
		const response = await buildApp().handle(
			new Request("http://localhost/admin/cosmetics/", {
				headers: { Authorization: "Bearer user-token" },
			}),
		);
		expect(response.status).toBe(403);
	});

	it("allows an administrator to list the catalog", async () => {
		const response = await buildApp().handle(
			new Request("http://localhost/admin/cosmetics/", {
				headers: { Authorization: "Bearer admin-token" },
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	it("accepts a multipart playmat publication from an administrator", async () => {
		const form = new FormData();
		form.set("type", "PLAYMAT");
		form.set("tier", "EXCLUSIVE");
		form.set("assetRef", "playmats/ember-vault/");
		form.set("displayName", "Ember Vault");
		form.append("files", new File([new Uint8Array([1, 2, 3])], "ember-vault.glb"));

		const response = await buildApp().handle(
			new Request("http://localhost/admin/cosmetics/", {
				method: "POST",
				headers: { Authorization: "Bearer admin-token" },
				body: form,
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			type: "PLAYMAT",
			assetRef: "playmats/ember-vault/",
			active: true,
			assetFiles: ["ember-vault.glb"],
		});
	});

	it("allows an administrator to configure one companion motion profile", async () => {
		const companion = Cosmetic.create({
			id: "9c8c956d-c744-4ff7-ae6f-f4a792ce5d96",
			type: CosmeticType.COMPANION,
			tier: CosmeticTier.EXCLUSIVE,
			assetRef: "companions/golden-dragon/",
			displayName: "Golden Dragon",
		});
		let saved: Cosmetic | undefined;
		const response = await buildApp(companion, (cosmetic) => {
			saved = cosmetic;
		}).handle(
			new Request(`http://localhost/admin/cosmetics/${companion.id}/animation`, {
				method: "PATCH",
				headers: {
					Authorization: "Bearer admin-token",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					animation: {
						targetHeight: 1.3,
						motion: { preset: "serpentine", intensity: 0.8, speed: 0.7 },
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			cosmeticId: companion.id,
			animation: { motion: { preset: "serpentine", intensity: 0.8, speed: 0.7 } },
		});
		expect(saved?.animation?.targetHeight).toBe(1.3);
	});

	it("replaces a companion GLB without creating another catalog entry", async () => {
		const companion = Cosmetic.create({
			id: "9c8c956d-c744-4ff7-ae6f-f4a792ce5d96",
			type: CosmeticType.COMPANION,
			tier: CosmeticTier.EXCLUSIVE,
			assetRef: "companions/golden-dragon/",
			displayName: "Golden Dragon",
			assetFiles: ["golden-dragon.glb"],
		});
		let saved: Cosmetic | undefined;
		const form = new FormData();
		form.set("file", new File([new Uint8Array([1, 2, 3])], "golden-dragon-animated.glb"));
		form.set(
			"animation",
			JSON.stringify({ clips: { idle: "idle", attack: "attack" }, motion: { preset: "hover" } }),
		);

		const response = await buildApp(companion, (cosmetic) => {
			saved = cosmetic;
		}).handle(
			new Request(`http://localhost/admin/cosmetics/${companion.id}/model`, {
				method: "PUT",
				headers: { Authorization: "Bearer admin-token" },
				body: form,
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			cosmeticId: companion.id,
			modelFile: "golden-dragon-animated.revision-abc12345.glb",
		});
		expect(saved?.id).toBe(companion.id);
		expect(saved?.assetRef).toBe("companions/golden-dragon/");
		expect(saved?.animation?.clips?.idle).toBe("idle");
	});
});
