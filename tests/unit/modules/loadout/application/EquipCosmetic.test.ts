import { describe, expect, it } from "bun:test";

import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { EntitlementsGatekeeper } from "../../../../../src/modules/entitlements/application/EntitlementsGatekeeper";
import { Entitlement } from "../../../../../src/modules/entitlements/domain/Entitlement";
import { EquipCosmetic } from "../../../../../src/modules/loadout/application/EquipCosmetic";
import { Loadout } from "../../../../../src/modules/loadout/domain/Loadout";
import { LoadoutRepository } from "../../../../../src/modules/loadout/domain/LoadoutRepository";
import { ForbiddenError } from "../../../../../src/shared/errors/ForbiddenError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";

function cosmetic(tier: CosmeticTier): Cosmetic {
	return Cosmetic.from({
		id: "cosmetic-1",
		type: CosmeticType.SLEEVE,
		tier,
		assetRef: "sleeves/a/",
		displayName: "A",
		active: true,
	});
}

function build(options: { found: Cosmetic | null; entitlements?: Entitlement[] }) {
	const cosmetics: CosmeticRepository = {
		findAll: async () => [],
		findById: async (id) => (options.found && options.found.id === id ? options.found : null),
		save: async () => undefined,
	};

	const saved: Loadout[] = [];
	const loadouts: LoadoutRepository = {
		findByUserId: async (userId) => Loadout.empty(userId),
		save: async (loadout) => {
			saved.push(loadout);
		},
	};

	// Real gatekeeper over a fake entitlement repository.
	const gatekeeper = new EntitlementsGatekeeper({
		findByUserId: async () => options.entitlements ?? [],
		save: async () => undefined,
	});

	return { equip: new EquipCosmetic(cosmetics, loadouts, gatekeeper), saved };
}

describe("EquipCosmetic", () => {
	it("equips a cosmetic the user is entitled to", async () => {
		const { equip, saved } = build({ found: cosmetic(CosmeticTier.REGISTERED) });

		await equip.run({ userId: "user-1", cosmeticType: CosmeticType.SLEEVE, cosmeticId: "cosmetic-1" });

		expect(saved).toHaveLength(1);
		expect(saved[0].equippedCosmeticId(CosmeticType.SLEEVE)).toBe("cosmetic-1");
	});

	it("rejects equipping a cosmetic the user is not entitled to", async () => {
		const { equip, saved } = build({ found: cosmetic(CosmeticTier.DONOR) });

		await expect(
			equip.run({ userId: "user-1", cosmeticType: CosmeticType.SLEEVE, cosmeticId: "cosmetic-1" }),
		).rejects.toBeInstanceOf(ForbiddenError);
		expect(saved).toHaveLength(0);
	});

	it("rejects an unknown cosmetic", async () => {
		const { equip } = build({ found: null });

		await expect(
			equip.run({ userId: "user-1", cosmeticType: CosmeticType.SLEEVE, cosmeticId: "missing" }),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("rejects equipping a cosmetic in the wrong slot", async () => {
		const { equip } = build({ found: cosmetic(CosmeticTier.STANDARD) });

		await expect(
			equip.run({ userId: "user-1", cosmeticType: CosmeticType.PLAYMAT, cosmeticId: "cosmetic-1" }),
		).rejects.toBeInstanceOf(InvalidArgumentError);
	});
});
