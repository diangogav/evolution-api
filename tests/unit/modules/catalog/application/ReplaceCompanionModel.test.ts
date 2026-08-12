import { describe, expect, it } from "bun:test";

import type {
	CosmeticAssetStorage,
	CosmeticAssetUpload,
} from "../../../../../src/modules/assets/domain/CosmeticAssetStorage";
import { ReplaceCompanionModel } from "../../../../../src/modules/catalog/application/ReplaceCompanionModel";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";

function companion(): Cosmetic {
	return Cosmetic.create({
		id: "9c8c956d-c744-4ff7-ae6f-f4a792ce5d96",
		type: CosmeticType.COMPANION,
		tier: CosmeticTier.EXCLUSIVE,
		assetRef: "companions/golden-dragon/",
		displayName: "Golden Dragon",
		assetFiles: ["golden-dragon.glb", "preview.webp"],
		animation: { rigFile: "legacy-rig.glb", clips: { idle: "Idle_A" } },
	});
}

function setup({ failSave = false } = {}) {
	const uploads: CosmeticAssetUpload[] = [];
	const deleted: string[] = [];
	let saved: Cosmetic | undefined;
	const cosmetic = companion();
	const repository: CosmeticRepository = {
		findAll: async () => [cosmetic],
		findById: async () => cosmetic,
		save: async (next) => {
			if (failSave) throw new Error("database unavailable");
			saved = next;
		},
	};
	const storage: CosmeticAssetStorage = {
		put: async (upload) => {
			uploads.push(upload);
		},
		delete: async (key) => {
			deleted.push(key);
		},
	};
	return {
		replace: new ReplaceCompanionModel(repository, storage, () => "abc12345"),
		uploads,
		deleted,
		getSaved: () => saved,
	};
}

describe("ReplaceCompanionModel", () => {
	it("versions the new GLB, keeps the identity, and removes the previous model", async () => {
		const { replace, uploads, deleted, getSaved } = setup();
		const animation = {
			clips: { idle: "idle", attack: "attack" },
			motion: { preset: "hover" as const, intensity: 0.9 },
		};

		const result = await replace.run({
			cosmeticId: companion().id,
			file: { name: "golden-dragon-animated.glb", bytes: new Uint8Array([1, 2, 3]) },
			animation,
		});

		expect(result.cosmeticId).toBe(companion().id);
		expect(result.modelFile).toBe("golden-dragon-animated.revision-abc12345.glb");
		expect(result.assetFiles).toEqual([
			"golden-dragon-animated.revision-abc12345.glb",
			"preview.webp",
		]);
		expect(uploads[0]).toMatchObject({
			key: "companions/golden-dragon/golden-dragon-animated.revision-abc12345.glb",
			contentType: "model/gltf-binary",
		});
		expect(deleted).toEqual(["companions/golden-dragon/golden-dragon.glb"]);
		expect(getSaved()?.id).toBe(companion().id);
		expect(getSaved()?.animation).toEqual(animation);
	});

	it("rolls back the new R2 object when catalog persistence fails", async () => {
		const { replace, deleted } = setup({ failSave: true });

		await expect(
			replace.run({
				cosmeticId: companion().id,
				file: { name: "golden-dragon-animated.glb", bytes: new Uint8Array([1]) },
			}),
		).rejects.toThrow("database unavailable");

		expect(deleted).toEqual([
			"companions/golden-dragon/golden-dragon-animated.revision-abc12345.glb",
		]);
	});

	it("rejects non-GLB replacements before touching storage", async () => {
		const { replace, uploads } = setup();

		await expect(
			replace.run({
				cosmeticId: companion().id,
				file: { name: "golden-dragon.gltf", bytes: new Uint8Array([1]) },
			}),
		).rejects.toThrow("must be a .glb");

		expect(uploads).toHaveLength(0);
	});
});
