import { describe, expect, it } from "bun:test";

import { CosmeticAccess } from "../../../../../src/modules/entitlements/domain/CosmeticAccess";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";

describe("CosmeticAccess", () => {
	it("grants access when ordinal tier covers the cosmetic's tier", () => {
		const access = new CosmeticAccess(CosmeticTier.REGISTERED, new Set());

		expect(access.canUse({ id: "mat-1", tier: CosmeticTier.STANDARD })).toBe(true);
		expect(access.canUse({ id: "mat-1", tier: CosmeticTier.REGISTERED })).toBe(true);
	});

	it("denies access when ordinal tier is insufficient and id is not in the granted set", () => {
		const access = new CosmeticAccess(CosmeticTier.REGISTERED, new Set());

		expect(access.canUse({ id: "mat-donor", tier: CosmeticTier.DONOR })).toBe(false);
	});

	it("grants access by cosmetic id even when tier is insufficient", () => {
		const access = new CosmeticAccess(CosmeticTier.REGISTERED, new Set(["mat-exclusive"]));

		expect(access.canUse({ id: "mat-exclusive", tier: CosmeticTier.DONOR })).toBe(true);
	});

	it("denies access when id does not match and tier is insufficient", () => {
		const access = new CosmeticAccess(CosmeticTier.REGISTERED, new Set(["mat-exclusive"]));

		expect(access.canUse({ id: "other-donor", tier: CosmeticTier.DONOR })).toBe(false);
	});

	it("STANDARD access grants only STANDARD cosmetics", () => {
		const access = new CosmeticAccess(CosmeticTier.STANDARD, new Set());

		expect(access.canUse({ id: "s1", tier: CosmeticTier.STANDARD })).toBe(true);
		expect(access.canUse({ id: "r1", tier: CosmeticTier.REGISTERED })).toBe(false);
		expect(access.canUse({ id: "d1", tier: CosmeticTier.DONOR })).toBe(false);
	});
});
