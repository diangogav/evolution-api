import { describe, expect, it } from "bun:test";

import { RefreshPublicCosmeticIndex } from "../../../../../src/modules/assets/application/RefreshPublicCosmeticIndex";
import { ActiveCosmeticRefs } from "../../../../../src/modules/assets/domain/ActiveCosmeticRefs";
import type { PublicCosmeticIndexStore } from "../../../../../src/modules/assets/domain/PublicCosmeticIndexStore";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import type { Logger } from "../../../../../src/shared/logger/domain/Logger";

function cosmetic(assetRef: string, active: boolean): Cosmetic {
	return Cosmetic.from({
		id: assetRef,
		type: CosmeticType.SLEEVE,
		tier: CosmeticTier.STANDARD,
		assetRef,
		displayName: assetRef,
		active,
	});
}

function setup({ catalog = [] as Cosmetic[], failFind = false, failWrite = false } = {}) {
	const written: string[][] = [];
	const errors: (string | Error)[] = [];
	const activeRefs = new ActiveCosmeticRefs();
	const store: PublicCosmeticIndexStore = {
		write: async (refs) => {
			if (failWrite) throw new Error("r2 unavailable");
			written.push([...refs]);
		},
	};
	const logger: Logger = {
		debug: () => undefined,
		info: () => undefined,
		error: (error) => {
			errors.push(error);
		},
	};
	const cosmetics = {
		findAll: async () => {
			if (failFind) throw new Error("database unavailable");
			return catalog;
		},
	};
	const refresh = new RefreshPublicCosmeticIndex(cosmetics, activeRefs, store, logger);
	return { refresh, activeRefs, written, errors };
}

describe("RefreshPublicCosmeticIndex", () => {
	it("loads only active refs into the set and writes them to the public index", async () => {
		const { refresh, activeRefs, written } = setup({
			catalog: [
				cosmetic("sleeves/b/", true),
				cosmetic("sleeves/hidden/", false),
				cosmetic("avatars/a/", true),
			],
		});

		await refresh.run();

		expect(activeRefs.has("sleeves/b/")).toBe(true);
		expect(activeRefs.has("avatars/a/")).toBe(true);
		expect(activeRefs.has("sleeves/hidden/")).toBe(false);
		expect(written).toEqual([["avatars/a/", "sleeves/b/"]]);
	});

	it("swaps the set on reload, dropping refs no longer active", async () => {
		const catalog = [cosmetic("sleeves/old/", true)];
		const { refresh, activeRefs } = setup({ catalog });
		await refresh.run();

		catalog.splice(0, 1, cosmetic("sleeves/new/", true));
		await refresh.run();

		expect(activeRefs.has("sleeves/old/")).toBe(false);
		expect(activeRefs.has("sleeves/new/")).toBe(true);
	});

	it("logs a repository failure, keeps the previous set and never throws", async () => {
		const { refresh, activeRefs, written, errors } = setup({ failFind: true });
		activeRefs.replace(["sleeves/kept/"]);

		await expect(refresh.run()).resolves.toBeUndefined();

		expect(errors).toHaveLength(1);
		expect(written).toHaveLength(0);
		expect(activeRefs.has("sleeves/kept/")).toBe(true);
	});

	it("logs an index write failure and never throws", async () => {
		const { refresh, activeRefs, errors } = setup({
			catalog: [cosmetic("sleeves/a/", true)],
			failWrite: true,
		});

		await expect(refresh.run()).resolves.toBeUndefined();

		expect(errors).toHaveLength(1);
		expect(activeRefs.has("sleeves/a/")).toBe(true);
	});

	it("runs overlapping refreshes one after another", async () => {
		const catalog = [cosmetic("sleeves/a/", true)];
		const { refresh, written } = setup({ catalog });

		const first = refresh.run();
		catalog.push(cosmetic("sleeves/b/", true));
		const second = refresh.run();
		await Promise.all([first, second]);

		expect(written[written.length - 1]).toEqual(["sleeves/a/", "sleeves/b/"]);
	});

	it("serves as the catalog change notifier", async () => {
		const { refresh, written } = setup({ catalog: [cosmetic("sleeves/a/", true)] });

		await refresh.catalogChanged();

		expect(written).toEqual([["sleeves/a/"]]);
	});
});
