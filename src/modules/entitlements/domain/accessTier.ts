import { CosmeticTier } from "../../catalog/domain/CosmeticTier";

// Ordinal ranking of access tiers. Access is gated "ordinal-first" (RFC §12):
// a user tier grants every cosmetic tier at or below it.
const RANK: Record<CosmeticTier, number> = {
	[CosmeticTier.STANDARD]: 0,
	[CosmeticTier.REGISTERED]: 1,
	[CosmeticTier.DONOR]: 2,
};

export function tierGrants(userTier: CosmeticTier, requiredTier: CosmeticTier): boolean {
	return RANK[userTier] >= RANK[requiredTier];
}
