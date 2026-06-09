import { CosmeticTier } from "../../catalog/domain/CosmeticTier";
import { tierGrants } from "./accessTier";

// Resolved access snapshot for a single user/request. Built once by the gatekeeper
// (one repo fetch) and evaluated synchronously per cosmetic — avoids N+1 queries.
export class CosmeticAccess {
	constructor(
		private readonly tier: CosmeticTier,
		private readonly cosmeticIds: ReadonlySet<string>,
	) {}

	canUse(c: { id: string; tier: CosmeticTier }): boolean {
		return tierGrants(this.tier, c.tier) || this.cosmeticIds.has(c.id);
	}
}
