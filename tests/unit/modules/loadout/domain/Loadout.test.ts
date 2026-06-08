import { describe, expect, it } from "bun:test";

import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { Loadout } from "../../../../../src/modules/loadout/domain/Loadout";

describe("Loadout", () => {
	it("starts empty and equips one cosmetic per slot", () => {
		const loadout = Loadout.empty("user-1");
		loadout.equip(CosmeticType.SLEEVE, "sleeve-1");

		expect(loadout.equippedCosmeticId(CosmeticType.SLEEVE)).toBe("sleeve-1");
		expect(loadout.equippedCosmeticId(CosmeticType.PLAYMAT)).toBeNull();
	});

	it("replaces the cosmetic in a slot when equipping again", () => {
		const loadout = Loadout.empty("user-1");
		loadout.equip(CosmeticType.SLEEVE, "sleeve-1");
		loadout.equip(CosmeticType.SLEEVE, "sleeve-2");

		expect(loadout.equippedCosmeticId(CosmeticType.SLEEVE)).toBe("sleeve-2");
		expect(loadout.items()).toHaveLength(1);
	});

	it("reconstructs from persisted rows and exposes its items", () => {
		const loadout = Loadout.from("user-1", [
			{ cosmeticType: CosmeticType.SLEEVE, cosmeticId: "sleeve-1" },
			{ cosmeticType: CosmeticType.PLAYMAT, cosmeticId: "playmat-1" },
		]);

		expect(loadout.userId).toBe("user-1");
		expect(loadout.items()).toHaveLength(2);
		expect(loadout.equippedCosmeticId(CosmeticType.PLAYMAT)).toBe("playmat-1");
	});
});
