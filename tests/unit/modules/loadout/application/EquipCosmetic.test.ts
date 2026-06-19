import { describe, expect, it } from "bun:test";

import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { EntitlementsGatekeeper } from "../../../../../src/modules/entitlements/application/EntitlementsGatekeeper";
import { Entitlement } from "../../../../../src/modules/entitlements/domain/Entitlement";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { GrantType } from "../../../../../src/modules/entitlements/domain/GrantType";
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

function companion(): Cosmetic {
	return Cosmetic.from({
		id: "companion-1",
		type: CosmeticType.COMPANION,
		tier: CosmeticTier.STANDARD,
		assetRef: "companions/kaykit-warrior/",
		displayName: "Warrior",
		active: true,
		animation: { rigFile: "Rig_Medium_General.glb", clips: { idle: "Idle_A" } },
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

		await equip.run({
			userId: "user-1",
			cosmeticType: CosmeticType.SLEEVE,
			cosmeticId: "cosmetic-1",
		});

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

	it("equips a COMPANION the user is entitled to", async () => {
		const { equip, saved } = build({ found: companion() });

		await equip.run({
			userId: "user-1",
			cosmeticType: CosmeticType.COMPANION,
			cosmeticId: "companion-1",
		});

		expect(saved).toHaveLength(1);
		expect(saved[0].equippedCosmeticId(CosmeticType.COMPANION)).toBe("companion-1");
	});

	// An unknown/non-uuid cosmeticId must resolve to a graceful NotFound (4xx), never a
	// 500. The Postgres id column is uuid, so a value like "skeleton-mage" would make the
	// repository throw `invalid input syntax for type uuid`; the repository guard turns
	// that into the contract's null, so the use case reports NotFound exactly as it does
	// for any missing cosmetic.
	it("rejects a non-uuid cosmeticId with NotFound instead of failing hard", async () => {
		const { equip, saved } = build({ found: null });

		await expect(
			equip.run({
				userId: "user-1",
				cosmeticType: CosmeticType.COMPANION,
				cosmeticId: "skeleton-mage",
			}),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(saved).toHaveLength(0);
	});

	// --- COSMETIC grant regression (spec: catalog scenario 6) ---

	it("allows equipping a DONOR cosmetic when user holds a COSMETIC grant for it", async () => {
		const cosmeticGrant = Entitlement.create({
			id: "e-grant",
			userId: "user-1",
			grantType: GrantType.COSMETIC,
			grantValue: "cosmetic-1",
			source: EntitlementSource.PURCHASE,
			expiresAt: null,
		});
		const { equip, saved } = build({
			found: cosmetic(CosmeticTier.DONOR),
			entitlements: [cosmeticGrant],
		});

		await equip.run({
			userId: "user-1",
			cosmeticType: CosmeticType.SLEEVE,
			cosmeticId: "cosmetic-1",
		});

		expect(saved).toHaveLength(1);
		expect(saved[0].equippedCosmeticId(CosmeticType.SLEEVE)).toBe("cosmetic-1");
	});
});
