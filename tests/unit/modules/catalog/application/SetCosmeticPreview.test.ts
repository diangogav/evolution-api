import { describe, expect, it } from "bun:test";

import { SetCosmeticPreview } from "../../../../../src/modules/catalog/application/SetCosmeticPreview";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type {
	CosmeticAssetStorage,
	CosmeticAssetUpload,
} from "../../../../../src/modules/catalog/domain/CosmeticAssetStorage";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

const cosmetic = (overrides: Partial<Parameters<typeof Cosmetic.from>[0]> = {}) =>
	Cosmetic.from({
		id: "pack-1",
		type: CosmeticType.EMOTE_PACK,
		tier: CosmeticTier.EXCLUSIVE,
		assetRef: "emote-packs/angry-face/",
		displayName: "Angry Face",
		active: true,
		assetFiles: ["pack.json", "angry.json"],
		essencePrice: 200,
		...overrides,
	});

function setup(existing: Cosmetic | null, { failPut = false } = {}) {
	const uploads: CosmeticAssetUpload[] = [];
	const saved: Cosmetic[] = [];
	let notified = 0;
	const storage: CosmeticAssetStorage = {
		put: async (upload) => {
			if (failPut) throw new Error("storage unavailable");
			uploads.push(upload);
		},
		delete: async () => undefined,
	};
	const repository: CosmeticRepository = {
		findAll: async () => (existing ? [existing] : []),
		findById: async (id) => (existing?.id === id ? existing : null),
		save: async (value) => {
			saved.push(value);
		},
	};
	const setPreview = new SetCosmeticPreview(repository, storage, {
		catalogChanged: async () => {
			notified += 1;
		},
	});
	return { setPreview, uploads, saved, notified: () => notified };
}

describe("SetCosmeticPreview", () => {
	it("stores the preview in the cosmetic's folder and records it among its files", async () => {
		const { setPreview, uploads, saved, notified } = setup(cosmetic());

		const result = await setPreview.run({ cosmeticId: "pack-1", bytes: jpeg });

		expect(uploads).toEqual([
			{ key: "emote-packs/angry-face/preview.jpg", bytes: jpeg, contentType: "image/jpeg" },
		]);
		expect(result.assetFiles).toEqual(["pack.json", "angry.json", "preview.jpg"]);
		expect(saved[0]?.assetFiles).toEqual(["pack.json", "angry.json", "preview.jpg"]);
		// The price and the rest of the cosmetic are left as they were.
		expect(saved[0]?.essencePrice).toBe(200);
		expect(notified()).toBe(1);
	});

	it("replaces a preview already recorded without listing it twice", async () => {
		const { setPreview, uploads, saved } = setup(
			cosmetic({ assetFiles: ["pack.json", "angry.json", "preview.jpg"] }),
		);

		const result = await setPreview.run({ cosmeticId: "pack-1", bytes: jpeg });

		expect(uploads).toHaveLength(1);
		expect(result.assetFiles).toEqual(["pack.json", "angry.json", "preview.jpg"]);
		expect(saved).toHaveLength(0);
	});

	it("only uploads for a cosmetic served by listing its folder", async () => {
		const { setPreview, uploads, saved } = setup(cosmetic({ assetFiles: null }));

		await setPreview.run({ cosmeticId: "pack-1", bytes: jpeg });

		expect(uploads).toHaveLength(1);
		expect(saved).toHaveLength(0);
	});

	it("rejects a type that is shown with its own image", async () => {
		const { setPreview, uploads } = setup(
			cosmetic({
				type: CosmeticType.AVATAR,
				assetRef: "avatars/frog/",
				assetFiles: ["render.jpg"],
			}),
		);

		await expect(setPreview.run({ cosmeticId: "pack-1", bytes: jpeg })).rejects.toThrow(
			InvalidArgumentError,
		);
		expect(uploads).toHaveLength(0);
	});

	it("rejects a file that is not a JPEG, and a cosmetic that does not exist", async () => {
		const known = setup(cosmetic());
		const unknown = setup(null);

		await expect(
			known.setPreview.run({ cosmeticId: "pack-1", bytes: new Uint8Array([1, 2, 3]) }),
		).rejects.toThrow("preview.jpg is not a JPEG image");
		await expect(unknown.setPreview.run({ cosmeticId: "pack-1", bytes: jpeg })).rejects.toThrow(
			NotFoundError,
		);
		expect(known.uploads).toHaveLength(0);
	});

	it("records nothing when the upload fails", async () => {
		const { setPreview, saved, notified } = setup(cosmetic(), { failPut: true });

		await expect(setPreview.run({ cosmeticId: "pack-1", bytes: jpeg })).rejects.toThrow(
			"storage unavailable",
		);
		expect(saved).toHaveLength(0);
		expect(notified()).toBe(0);
	});
});
