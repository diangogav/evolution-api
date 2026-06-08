import { describe, expect, it } from "bun:test";

import { Entitlement } from "../../../../../src/modules/entitlements/domain/Entitlement";
import { EntitlementSource } from "../../../../../src/modules/entitlements/domain/EntitlementSource";
import { GrantType } from "../../../../../src/modules/entitlements/domain/GrantType";

function tierGrant(expiresAt: Date | null): Entitlement {
	return Entitlement.create({
		id: "ent-1",
		userId: "user-1",
		grantType: GrantType.TIER,
		grantValue: "REGISTERED",
		source: EntitlementSource.REGISTRATION,
		expiresAt,
	});
}

describe("Entitlement", () => {
	it("is active when it has no expiration", () => {
		expect(tierGrant(null).isActiveAt(new Date("2026-06-08T00:00:00Z"))).toBe(true);
	});

	it("is active before its expiration and inactive once expired", () => {
		const entitlement = tierGrant(new Date("2026-07-01T00:00:00Z"));

		expect(entitlement.isActiveAt(new Date("2026-06-08T00:00:00Z"))).toBe(true);
		expect(entitlement.isActiveAt(new Date("2026-08-01T00:00:00Z"))).toBe(false);
	});
});
