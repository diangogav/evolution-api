import { describe, expect, it } from "bun:test";

import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticAccess } from "../../../../../src/modules/entitlements/domain/CosmeticAccess";
import { Entitlement } from "../../../../../src/modules/entitlements/domain/Entitlement";
import { EntitlementRepository } from "../../../../../src/modules/entitlements/domain/EntitlementRepository";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { GrantType } from "../../../../../src/modules/entitlements/domain/GrantType";
import { EntitlementsGatekeeper } from "../../../../../src/modules/entitlements/application/EntitlementsGatekeeper";

const NOW = new Date("2026-06-08T00:00:00Z");

function makeRepo(entitlements: Entitlement[]): { repo: EntitlementRepository; callCount: () => number } {
	let calls = 0;
	const repo: EntitlementRepository = {
		findByUserId: async () => { calls++; return entitlements; },
		save: async () => undefined,
	};
	return { repo, callCount: () => calls };
}

function gatekeeper(entitlements: Entitlement[]): EntitlementsGatekeeper {
	return new EntitlementsGatekeeper(makeRepo(entitlements).repo);
}

function donorGrant(expiresAt: Date | null): Entitlement {
	return Entitlement.create({
		id: "e1",
		userId: "user-1",
		grantType: GrantType.TIER,
		grantValue: CosmeticTier.DONOR,
		source: EntitlementSource.DONATION,
		expiresAt,
	});
}

function cosmeticGrant(cosmeticId: string, expiresAt: Date | null): Entitlement {
	return Entitlement.create({
		id: "e2",
		userId: "user-1",
		grantType: GrantType.COSMETIC,
		grantValue: cosmeticId,
		source: EntitlementSource.PURCHASE,
		expiresAt,
	});
}

describe("EntitlementsGatekeeper", () => {
	// --- existing tier-based tests (regression) ---

	it("lets a registered user (no donor grant) use standard and registered cosmetics, but not donor", async () => {
		const gk = gatekeeper([]);

		expect(await gk.canUse("user-1", { id: "s1", tier: CosmeticTier.STANDARD }, NOW)).toBe(true);
		expect(await gk.canUse("user-1", { id: "r1", tier: CosmeticTier.REGISTERED }, NOW)).toBe(true);
		expect(await gk.canUse("user-1", { id: "d1", tier: CosmeticTier.DONOR }, NOW)).toBe(false);
	});

	it("lets a user with an active donor grant use donor cosmetics", async () => {
		const gk = gatekeeper([donorGrant(null)]);

		expect(await gk.canUse("user-1", { id: "d1", tier: CosmeticTier.DONOR }, NOW)).toBe(true);
	});

	it("ignores an expired donor grant", async () => {
		const gk = gatekeeper([donorGrant(new Date("2026-01-01T00:00:00Z"))]);

		expect(await gk.canUse("user-1", { id: "d1", tier: CosmeticTier.DONOR }, NOW)).toBe(false);
	});

	// --- new accessFor tests ---

	it("accessFor returns CosmeticAccess instance", async () => {
		const gk = gatekeeper([]);
		const access = await gk.accessFor("user-1", NOW);

		expect(access).toBeInstanceOf(CosmeticAccess);
	});

	it("accessFor: active COSMETIC grant for matching id grants the cosmetic above ordinal tier", async () => {
		const gk = gatekeeper([cosmeticGrant("mat-exclusive", null)]);
		const access = await gk.accessFor("user-1", NOW);

		expect(access.canUse({ id: "mat-exclusive", tier: CosmeticTier.DONOR })).toBe(true);
	});

	it("accessFor: active COSMETIC grant for a different id does not grant the cosmetic", async () => {
		const gk = gatekeeper([cosmeticGrant("mat-exclusive", null)]);
		const access = await gk.accessFor("user-1", NOW);

		expect(access.canUse({ id: "other-donor", tier: CosmeticTier.DONOR })).toBe(false);
	});

	it("accessFor: expired COSMETIC grant is ignored", async () => {
		const gk = gatekeeper([cosmeticGrant("mat-exclusive", new Date("2026-01-01T00:00:00Z"))]);
		const access = await gk.accessFor("user-1", NOW);

		expect(access.canUse({ id: "mat-exclusive", tier: CosmeticTier.DONOR })).toBe(false);
	});

	it("accessFor(null) returns STANDARD access without calling the repository", async () => {
		const { repo, callCount } = makeRepo([]);
		const gk = new EntitlementsGatekeeper(repo);
		const access = await gk.accessFor(null, NOW);

		expect(access.canUse({ id: "s1", tier: CosmeticTier.STANDARD })).toBe(true);
		expect(access.canUse({ id: "r1", tier: CosmeticTier.REGISTERED })).toBe(false);
		expect(access.canUse({ id: "d1", tier: CosmeticTier.DONOR })).toBe(false);
		expect(callCount()).toBe(0);
	});

	it("N+1 guard: accessFor calls findByUserId exactly once regardless of how many canUse calls follow", async () => {
		const { repo, callCount } = makeRepo([]);
		const gk = new EntitlementsGatekeeper(repo);
		const access = await gk.accessFor("user-1", NOW);

		// Multiple canUse calls — all synchronous, no extra fetches.
		access.canUse({ id: "s1", tier: CosmeticTier.STANDARD });
		access.canUse({ id: "r1", tier: CosmeticTier.REGISTERED });
		access.canUse({ id: "d1", tier: CosmeticTier.DONOR });

		expect(callCount()).toBe(1);
	});
});
