import { describe, expect, it } from "bun:test";

import { UpdateCosmetic } from "../../../../../src/modules/catalog/application/UpdateCosmetic";
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

const bytes = (...values: number[]) => new Uint8Array(values);

const avatar = (overrides: Partial<Parameters<typeof Cosmetic.from>[0]> = {}) =>
	Cosmetic.from({
		id: "avatar-1",
		type: CosmeticType.AVATAR,
		tier: CosmeticTier.STANDARD,
		assetRef: "avatars/frog-mage/",
		displayName: "Frog",
		active: true,
		assetFiles: ["render.jpg", "preview.jpg"],
		essencePrice: null,
		...overrides,
	});

function setup(existing: Cosmetic | null, { failPut = false } = {}) {
	const uploads: CosmeticAssetUpload[] = [];
	const deleted: string[] = [];
	const saved: Cosmetic[] = [];
	let notified = 0;
	const storage: CosmeticAssetStorage = {
		put: async (upload) => {
			if (failPut) throw new Error("storage unavailable");
			uploads.push(upload);
		},
		delete: async (key) => {
			deleted.push(key);
		},
	};
	const repository: CosmeticRepository = {
		findAll: async () => (existing ? [existing] : []),
		findById: async (id) => (existing?.id === id ? existing : null),
		save: async (value) => {
			saved.push(value);
		},
	};
	const update = new UpdateCosmetic(repository, storage, {
		catalogChanged: async () => {
			notified += 1;
		},
	});
	return { update, uploads, deleted, saved, notified: () => notified };
}

const change = {
	cosmeticId: "avatar-1",
	tier: CosmeticTier.EXCLUSIVE,
	displayName: "Frog Mage",
	essencePrice: 800,
	files: [],
};

describe("UpdateCosmetic", () => {
	it("changes the name, tier and price and leaves the files alone when none are sent", async () => {
		const { update, uploads, deleted, saved, notified } = setup(avatar());

		const result = await update.run(change);

		expect(result).toEqual({
			id: "avatar-1",
			type: CosmeticType.AVATAR,
			tier: CosmeticTier.EXCLUSIVE,
			assetRef: "avatars/frog-mage/",
			displayName: "Frog Mage",
			active: true,
			assetFiles: ["render.jpg", "preview.jpg"],
			essencePrice: 800,
		});
		expect(saved).toHaveLength(1);
		expect(uploads).toHaveLength(0);
		expect(deleted).toHaveLength(0);
		expect(notified()).toBe(1);
	});

	it("leaves the same cosmetic when the same request is sent twice", async () => {
		const first = setup(avatar());
		const once = await first.update.run(change);
		const second = setup(first.saved[0] ?? null);

		const twice = await second.update.run(change);

		expect(twice).toEqual(once);
	});

	it("takes the cosmetic out of the shop when the price is left out", async () => {
		const { update, saved } = setup(avatar({ tier: CosmeticTier.EXCLUSIVE, essencePrice: 800 }));

		const result = await update.run({ ...change, essencePrice: undefined });

		expect(result.essencePrice).toBeNull();
		expect(saved[0]?.essencePrice).toBeNull();
	});

	it("replaces the files, records the new ones and removes the ones no longer named", async () => {
		const { update, uploads, deleted, saved } = setup(avatar());

		const result = await update.run({
			...change,
			files: [{ name: "render.jpg", bytes: bytes(9, 9) }],
		});

		expect(uploads).toEqual([
			{ key: "avatars/frog-mage/render.jpg", bytes: bytes(9, 9), contentType: "image/jpeg" },
		]);
		expect(result.assetFiles).toEqual(["render.jpg"]);
		expect(saved[0]?.assetFiles).toEqual(["render.jpg"]);
		expect(deleted).toEqual(["avatars/frog-mage/preview.jpg"]);
	});

	it("keeps a cosmetic inactive when it was", async () => {
		const { update, saved } = setup(avatar({ active: false }));

		const result = await update.run(change);

		expect(result.active).toBe(false);
		expect(saved[0]?.active).toBe(false);
	});

	it("rejects a price on a tier everyone holds, before touching storage or the record", async () => {
		const { update, uploads, saved } = setup(avatar());

		await expect(
			update.run({
				...change,
				tier: CosmeticTier.STANDARD,
				files: [{ name: "render.jpg", bytes: bytes(1) }],
			}),
		).rejects.toThrow("A STANDARD cosmetic cannot have a price");

		expect(uploads).toHaveLength(0);
		expect(saved).toHaveLength(0);
	});

	it("rejects files the type does not accept, before touching storage", async () => {
		const { update, uploads, saved } = setup(avatar());

		await expect(
			update.run({ ...change, files: [{ name: "preview.jpg", bytes: bytes(1) }] }),
		).rejects.toThrow("AVATAR requires render.jpg");
		await expect(
			update.run({ ...change, files: [{ name: "../render.jpg", bytes: bytes(1) }] }),
		).rejects.toThrow(InvalidArgumentError);

		expect(uploads).toHaveLength(0);
		expect(saved).toHaveLength(0);
	});

	it("does not record anything when an upload fails", async () => {
		const { update, saved, deleted, notified } = setup(avatar(), { failPut: true });

		await expect(
			update.run({ ...change, files: [{ name: "render.jpg", bytes: bytes(1) }] }),
		).rejects.toThrow("storage unavailable");

		expect(saved).toHaveLength(0);
		expect(deleted).toHaveLength(0);
		expect(notified()).toBe(0);
	});

	it("rejects a cosmetic that does not exist", async () => {
		await expect(setup(null).update.run(change)).rejects.toThrow(NotFoundError);
	});
});
