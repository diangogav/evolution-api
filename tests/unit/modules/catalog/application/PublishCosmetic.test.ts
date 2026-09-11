import { describe, expect, it } from "bun:test";

import type {
	CosmeticAssetStorage,
	CosmeticAssetUpload,
} from "../../../../../src/modules/assets/domain/CosmeticAssetStorage";
import { PublishCosmetic } from "../../../../../src/modules/catalog/application/PublishCosmetic";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";

function setup({ failSave = false, existing = [] as Cosmetic[] } = {}) {
	const uploads: CosmeticAssetUpload[] = [];
	const deleted: string[] = [];
	const saved: Cosmetic[] = [];
	const storage: CosmeticAssetStorage = {
		put: async (upload) => {
			uploads.push(upload);
		},
		delete: async (key) => {
			deleted.push(key);
		},
	};
	const repository: CosmeticRepository = {
		findAll: async () => existing,
		findById: async () => null,
		save: async (cosmetic) => {
			if (failSave) throw new Error("database unavailable");
			saved.push(cosmetic);
		},
	};
	return { publish: new PublishCosmetic(repository, storage), uploads, deleted, saved };
}

describe("PublishCosmetic", () => {
	it("rejects a playmat that only ships a glTF model, before touching storage", async () => {
		const { publish, uploads, saved } = setup();

		await expect(
			publish.run({
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.EXCLUSIVE,
				assetRef: "playmats/ember-vault/",
				displayName: "Ember Vault",
				files: [{ name: "ember-vault.glb", bytes: new Uint8Array([1, 2, 3]) }],
			}),
		).rejects.toThrow("PLAYMAT requires surface.webp, surface.png or surface.jpg");

		expect(uploads).toHaveLength(0);
		expect(saved).toHaveLength(0);
	});

	it("stores a 2D stage's images and theme.json with their real content types", async () => {
		const { publish, uploads } = setup();
		await publish.run({
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.STANDARD,
			assetRef: "playmats/kagura-castle/",
			displayName: "Castillo de Kagura",
			files: [
				{ name: "surface.webp", bytes: new Uint8Array([1]) },
				{ name: "background.webp", bytes: new Uint8Array([2]) },
				{ name: "theme.json", bytes: new Uint8Array([3]) },
			],
		});

		expect(uploads.map((u) => [u.key, u.contentType])).toEqual([
			["playmats/kagura-castle/surface.webp", "image/webp"],
			["playmats/kagura-castle/background.webp", "image/webp"],
			["playmats/kagura-castle/theme.json", "application/json"],
		]);
	});

	it("rolls back uploaded objects when catalog persistence fails", async () => {
		const { publish, deleted } = setup({ failSave: true });

		await expect(
			publish.run({
				type: CosmeticType.AVATAR,
				tier: CosmeticTier.STANDARD,
				assetRef: "avatars/ember-face/",
				displayName: "Ember Face",
				files: [
					{ name: "render.jpg", bytes: new Uint8Array([1]) },
					{ name: "preview.jpg", bytes: new Uint8Array([2]) },
				],
			}),
		).rejects.toThrow("database unavailable");

		expect(deleted).toEqual(["avatars/ember-face/render.jpg", "avatars/ember-face/preview.jpg"]);
	});

	it("rejects unsafe prefixes before touching storage", async () => {
		const { publish, uploads } = setup();

		await expect(
			publish.run({
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.STANDARD,
				assetRef: "playmats/../escape/",
				displayName: "Unsafe",
				files: [{ name: "surface.webp", bytes: new Uint8Array([1]) }],
			}),
		).rejects.toThrow("assetRef");

		expect(uploads).toHaveLength(0);
	});

	it("rejects a duplicate catalog prefix", async () => {
		const existing = Cosmetic.create({
			id: crypto.randomUUID(),
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.STANDARD,
			assetRef: "playmats/existing/",
			displayName: "Existing",
		});
		const { publish } = setup({ existing: [existing] });

		await expect(
			publish.run({
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.STANDARD,
				assetRef: "playmats/existing/",
				displayName: "Duplicate",
				files: [{ name: "surface.webp", bytes: new Uint8Array([1]) }],
			}),
		).rejects.toThrow("already uses assetRef");
	});
});
