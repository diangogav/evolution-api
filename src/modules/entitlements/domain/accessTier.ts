import { CosmeticTier } from "../../catalog/domain/CosmeticTier";

// Ordinal ranking of access tiers. Access is gated "ordinal-first" (RFC §12):
// a user tier grants every cosmetic tier at or below it.
const RANK: Record<CosmeticTier, number> = {
	[CosmeticTier.STANDARD]: 0,
	[CosmeticTier.REGISTERED]: 1,
	[CosmeticTier.DONOR]: 2,
	// Above DONOR on purpose: the gatekeeper never assigns EXCLUSIVE as a user tier, so
	// tierGrants(<anyUserTier>, EXCLUSIVE) is always false. The only access path is an
	// explicit per-user COSMETIC entitlement.
	[CosmeticTier.EXCLUSIVE]: 3,
};

export function tierGrants(userTier: CosmeticTier, requiredTier: CosmeticTier): boolean {
	return RANK[userTier] >= RANK[requiredTier];
}
