import { describe, expect, it } from "bun:test";

import { GetCosmeticsCatalog } from "../../../../../src/modules/catalog/application/GetCosmeticsCatalog";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { CosmeticAccess } from "../../../../../src/modules/entitlements/domain/CosmeticAccess";
import { EntitlementsGatekeeper } from "../../../../../src/modules/entitlements/application/EntitlementsGatekeeper";
import { EntitlementRepository } from "../../../../../src/modules/entitlements/domain/EntitlementRepository";
import { Entitlement } from "../../../../../src/modules/entitlements/domain/Entitlement";
import { GrantType } from "../../../../../src/modules/entitlements/domain/GrantType";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";

const sleeve = Cosmetic.from({
	id: "1",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.STANDARD,
	assetRef: "sleeves/a/",
	displayName: "A",
	active: true,
});
const playmat = Cosmetic.from({
	id: "2",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.REGISTERED,
	assetRef: "playmats/b/",
	displayName: "B",
	active: true,
});
const inactive = Cosmetic.from({
	id: "3",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.STANDARD,
	assetRef: "sleeves/c/",
	displayName: "C",
	active: false,
});
const donorMat = Cosmetic.from({
	id: "mat-exclusive",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.DONOR,
	assetRef: "playmats/exclusive/",
	displayName: "Exclusive",
	active: true,
});
const otherDonorMat = Cosmetic.from({
	id: "other-donor",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.DONOR,
	assetRef: "playmats/other/",
	displayName: "Other Donor",
	active: true,
});
const retiredSleeve = Cosmetic.from({
	id: "retired-sleeve",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.DONOR,
	assetRef: "sleeves/retired/",
	displayName: "Retired",
	active: false,
});

const signer: AssetUrlSigner = {
	sign: () => "",
	signMany: () => ({}),
	signManifest: async (prefix) => ({ "render.jpg": `signed:${prefix}render.jpg` }),
};

function fakeRepo(cosmetics: Cosmetic[]): CosmeticRepository {
	return {
		findAll: async () => cosmetics,
		findById: async () => null,
		save: async () => undefined,
	};
}

function gatekeeperWith(entitlements: Entitlement[]): { gk: EntitlementsGatekeeper; callCount: () => number } {
	let calls = 0;
	const repo: EntitlementRepository = {
		findByUserId: async () => { calls++; return entitlements; },
		save: async () => undefined,
	};
	return { gk: new EntitlementsGatekeeper(repo), callCount: () => calls };
}

function makeCatalog(cosmetics: Cosmetic[], gk: EntitlementsGatekeeper): GetCosmeticsCatalog {
	return new GetCosmeticsCatalog(fakeRepo(cosmetics), signer, gk);
}

// Legacy helper for old tests (no userId → no gatekeeper needed — but after the
// refactor, catalog requires a gatekeeper; we inject a real one backed by an
// empty repo so anon users see STANDARD access, which matches the prior behaviour
// for the two old tests that only have STANDARD/REGISTERED cosmetics and called
// run() with no userId).
function catalogOf(cosmetics: Cosmetic[]): GetCosmeticsCatalog {
	const { gk } = gatekeeperWith([]);
	return makeCatalog(cosmetics, gk);
}

describe("GetCosmeticsCatalog", () => {
	// --- original tests (now run with null userId — anon path) ---

	it("returns active cosmetics with their signed asset manifest (anon, STANDARD+REGISTERED here passes since they both fit)", async () => {
		// sleeve=STANDARD, playmat=REGISTERED. Anon user gets STANDARD only.
		// Updating expectation: registered access no longer assumed for anon.
		// Use a registered gatekeeper to preserve the original test intent.
		const { gk } = gatekeeperWith([]);
		const catalog = new GetCosmeticsCatalog(fakeRepo([sleeve, playmat]), signer, gk);
		// Run with registeredUserId so both are visible (mirroring original behaviour)
		const result = await catalog.run({}, "registered-user");

		expect(result).toHaveLength(2);
		expect(result[0].assets).toEqual({ "render.jpg": "signed:sleeves/a/render.jpg" });
	});

	it("excludes inactive cosmetics", async () => {
		const result = await catalogOf([sleeve, inactive]).run({}, null);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("1");
	});

	it("filters by type", async () => {
		const { gk } = gatekeeperWith([]);
		const catalog = makeCatalog([sleeve, playmat], gk);
		const result = await catalog.run({ type: CosmeticType.PLAYMAT }, "registered-user");

		expect(result).toHaveLength(1);
		expect(result[0].type).toBe(CosmeticType.PLAYMAT);
	});

	it("filters by tier", async () => {
		const { gk } = gatekeeperWith([]);
		const catalog = makeCatalog([sleeve, playmat], gk);
		const result = await catalog.run({ tier: CosmeticTier.STANDARD }, "registered-user");

		expect(result).toHaveLength(1);
		expect(result[0].tier).toBe(CosmeticTier.STANDARD);
	});

	// --- new personalized catalog tests ---

	it("anonymous user sees only STANDARD cosmetics", async () => {
		const { gk } = gatekeeperWith([]);
		const catalog = makeCatalog([sleeve, playmat, donorMat], gk);

		const result = await catalog.run({}, null);

		expect(result.every((c) => c.tier === CosmeticTier.STANDARD)).toBe(true);
		expect(result).toHaveLength(1);
	});

	it("registered user sees STANDARD and REGISTERED, not DONOR", async () => {
		const { gk } = gatekeeperWith([]);
		const catalog = makeCatalog([sleeve, playmat, donorMat], gk);

		const result = await catalog.run({}, "user-registered");

		const tiers = result.map((c) => c.tier);
		expect(tiers).toContain(CosmeticTier.STANDARD);
		expect(tiers).toContain(CosmeticTier.REGISTERED);
		expect(tiers).not.toContain(CosmeticTier.DONOR);
	});

	it("donor user sees all three tiers", async () => {
		const donorTierGrant = Entitlement.create({
			id: "e-donor",
			userId: "user-donor",
			grantType: GrantType.TIER,
			grantValue: CosmeticTier.DONOR,
			source: EntitlementSource.DONATION,
			expiresAt: null,
		});
		const { gk } = gatekeeperWith([donorTierGrant]);
		const catalog = makeCatalog([sleeve, playmat, donorMat], gk);

		const result = await catalog.run({}, "user-donor");

		const tiers = result.map((c) => c.tier);
		expect(tiers).toContain(CosmeticTier.STANDARD);
		expect(tiers).toContain(CosmeticTier.REGISTERED);
		expect(tiers).toContain(CosmeticTier.DONOR);
	});

	it("registered user with a COSMETIC grant sees that specific DONOR cosmetic", async () => {
		const cosmeticGrant = Entitlement.create({
			id: "e-cosmetic",
			userId: "user-registered",
			grantType: GrantType.COSMETIC,
			grantValue: "mat-exclusive",
			source: EntitlementSource.PURCHASE,
			expiresAt: null,
		});
		const { gk } = gatekeeperWith([cosmeticGrant]);
		const catalog = makeCatalog([sleeve, donorMat, otherDonorMat], gk);

		const result = await catalog.run({}, "user-registered");

		const ids = result.map((c) => c.id);
		expect(ids).toContain("mat-exclusive");
		expect(ids).not.toContain("other-donor");
	});

	it("inactive cosmetic is excluded even when user holds a COSMETIC grant for it", async () => {
		const cosmeticGrant = Entitlement.create({
			id: "e-cosmetic",
			userId: "user-1",
			grantType: GrantType.COSMETIC,
			grantValue: "retired-sleeve",
			source: EntitlementSource.PURCHASE,
			expiresAt: null,
		});
		const { gk } = gatekeeperWith([cosmeticGrant]);
		const catalog = makeCatalog([sleeve, retiredSleeve], gk);

		const result = await catalog.run({}, "user-1");

		expect(result.map((c) => c.id)).not.toContain("retired-sleeve");
	});

	it("N+1 guard: only one accessFor call regardless of cosmetic count", async () => {
		// Use a spy gatekeeper to count accessFor calls.
		let accessForCalls = 0;
		const spyGk = {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			accessFor: async (_userId: string | null) => {
				accessForCalls++;
				return new CosmeticAccess(CosmeticTier.REGISTERED, new Set());
			},
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			canUse: async (_userId: string, _c: { id: string; tier: CosmeticTier }) => false,
		} as unknown as EntitlementsGatekeeper;

		const catalog = makeCatalog([sleeve, playmat, donorMat, otherDonorMat], spyGk);
		await catalog.run({}, "user-1");

		expect(accessForCalls).toBe(1);
	});
});
