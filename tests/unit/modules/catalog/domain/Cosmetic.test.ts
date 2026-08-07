import { describe, expect, it } from "bun:test";

import { CompanionAnimationDescriptor } from "../../../../../src/modules/catalog/domain/CompanionAnimation";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";

const animation: CompanionAnimationDescriptor = {
	rigFile: "Rig_Medium_General.glb",
	targetHeight: 1.6,
	orientationOffsetY: 0,
	clips: {
		idle: "Idle_A",
		spawn: "Spawn_Ground",
		attack: "Throw",
	},
};

describe("Cosmetic", () => {
	it("creates a COMPANION carrying an animation descriptor", () => {
		const cosmetic = Cosmetic.create({
			id: "companion-1",
			type: CosmeticType.COMPANION,
			tier: CosmeticTier.STANDARD,
			assetRef: "companions/kaykit-warrior/",
			displayName: "Warrior",
			animation,
		});

		expect(cosmetic.type).toBe(CosmeticType.COMPANION);
		expect(cosmetic.animation).toEqual(animation);
	});

	it("round-trips the animation descriptor through from + toPrimitives", () => {
		const cosmetic = Cosmetic.from({
			id: "companion-1",
			type: CosmeticType.COMPANION,
			tier: CosmeticTier.STANDARD,
			assetRef: "companions/kaykit-warrior/",
			displayName: "Warrior",
			active: true,
			animation,
		});

		expect(cosmetic.toPrimitives().animation).toEqual(animation);
	});

	it("round-trips the persisted relative asset file index", () => {
		const assetFiles = ["character.glb", "Rig_Medium_General.glb", "preview.jpg"];
		const cosmetic = Cosmetic.from({
			id: "companion-1",
			type: CosmeticType.COMPANION,
			tier: CosmeticTier.STANDARD,
			assetRef: "companions/kaykit-warrior/",
			displayName: "Warrior",
			active: true,
			animation,
			assetFiles,
		});

		expect(cosmetic.assetFiles).toEqual(assetFiles);
		expect(cosmetic.toPrimitives().assetFiles).toEqual(assetFiles);
	});

	it("leaves animation undefined for non-COMPANION cosmetics", () => {
		const cosmetic = Cosmetic.create({
			id: "sleeve-1",
			type: CosmeticType.SLEEVE,
			tier: CosmeticTier.STANDARD,
			assetRef: "sleeves/a/",
			displayName: "A",
		});

		expect(cosmetic.animation).toBeUndefined();
		expect(cosmetic.toPrimitives().animation).toBeUndefined();
	});

	it("rejects an animation descriptor on a non-COMPANION cosmetic", () => {
		expect(() =>
			Cosmetic.create({
				id: "sleeve-1",
				type: CosmeticType.SLEEVE,
				tier: CosmeticTier.STANDARD,
				assetRef: "sleeves/a/",
				displayName: "A",
				animation,
			}),
		).toThrow(InvalidArgumentError);
	});
});
