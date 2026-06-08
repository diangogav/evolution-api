import { describe, expect, it } from "bun:test";

import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { Entitlement } from "../../../../../src/modules/entitlements/domain/Entitlement";
import { EntitlementRepository } from "../../../../../src/modules/entitlements/domain/EntitlementRepository";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { GrantType } from "../../../../../src/modules/entitlements/domain/GrantType";
import { EntitlementsGatekeeper } from "../../../../../src/modules/entitlements/application/EntitlementsGatekeeper";

const NOW = new Date("2026-06-08T00:00:00Z");

function gatekeeper(entitlements: Entitlement[]): EntitlementsGatekeeper {
	const repository: EntitlementRepository = {
		findByUserId: async () => entitlements,
		save: async () => undefined,
	};

	return new EntitlementsGatekeeper(repository);
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

describe("EntitlementsGatekeeper", () => {
	it("lets a registered user (no donor grant) use standard and registered cosmetics, but not donor", async () => {
		const gk = gatekeeper([]);

		expect(await gk.canUse("user-1", { tier: CosmeticTier.STANDARD }, NOW)).toBe(true);
		expect(await gk.canUse("user-1", { tier: CosmeticTier.REGISTERED }, NOW)).toBe(true);
		expect(await gk.canUse("user-1", { tier: CosmeticTier.DONOR }, NOW)).toBe(false);
	});

	it("lets a user with an active donor grant use donor cosmetics", async () => {
		const gk = gatekeeper([donorGrant(null)]);

		expect(await gk.canUse("user-1", { tier: CosmeticTier.DONOR }, NOW)).toBe(true);
	});

	it("ignores an expired donor grant", async () => {
		const gk = gatekeeper([donorGrant(new Date("2026-01-01T00:00:00Z"))]);

		expect(await gk.canUse("user-1", { tier: CosmeticTier.DONOR }, NOW)).toBe(false);
	});
});
