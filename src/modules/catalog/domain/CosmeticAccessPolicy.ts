import type { CosmeticTier } from "./CosmeticTier";

// What a user may use, resolved once per request and then checked per cosmetic.
// Catalog reads only filter through it; entitlements implements it.
export interface CosmeticAccess {
	canUse(cosmetic: { id: string; tier: CosmeticTier }): boolean;
}

export interface CosmeticAccessPolicy {
	accessFor(userId: string | null): Promise<CosmeticAccess>;
}
