import { describe, expect, it } from "bun:test";

import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";

describe("Cosmetic", () => {
	it("round-trips the persisted relative asset file index", () => {
		const assetFiles = ["surface.webp", "background.webp", "theme.json"];
		const cosmetic = Cosmetic.from({
			id: "stage-1",
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.STANDARD,
			assetRef: "playmats/kagura-castle/",
			displayName: "Castillo de Kagura",
			active: true,
			assetFiles,
		});

		expect(cosmetic.assetFiles).toEqual(assetFiles);
		expect(cosmetic.toPrimitives().assetFiles).toEqual(assetFiles);
	});

	it("carries no animation descriptor now that companions are gone", () => {
		const cosmetic = Cosmetic.create({
			id: "stage-1",
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.STANDARD,
			assetRef: "playmats/kagura-castle/",
			displayName: "Castillo de Kagura",
		});

		expect(cosmetic).not.toHaveProperty("animation");
		expect(cosmetic.toPrimitives()).not.toHaveProperty("animation");
	});

	it("requires the assetRef to be a folder prefix", () => {
		expect(() =>
			Cosmetic.create({
				id: "stage-1",
				type: CosmeticType.PLAYMAT,
				tier: CosmeticTier.STANDARD,
				assetRef: "playmats/kagura-castle",
				displayName: "Castillo de Kagura",
			}),
		).toThrow(InvalidArgumentError);
	});
});
