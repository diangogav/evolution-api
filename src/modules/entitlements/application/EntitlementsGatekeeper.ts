import { CosmeticTier } from "../../catalog/domain/CosmeticTier";
import { CosmeticAccess } from "../domain/CosmeticAccess";
import { EntitlementRepository } from "../domain/EntitlementRepository";
import { GrantType } from "../domain/GrantType";

// The single access gate for cosmetics. Every access check must pass through here
// — callers never compare tiers themselves (RFC §8). Resolves one snapshot
// (CosmeticAccess) per user/request so N cosmetics cost O(1) repo fetches.
export class EntitlementsGatekeeper {
	constructor(private readonly entitlements: EntitlementRepository) {}

	async accessFor(userId: string | null, at: Date = new Date()): Promise<CosmeticAccess> {
		if (userId === null) {
			return new CosmeticAccess(CosmeticTier.STANDARD, new Set());
		}

		const granted = await this.entitlements.findByUserId(userId);

		const isDonor = granted.some(
			(e) =>
				e.grantType === GrantType.TIER &&
				e.grantValue === CosmeticTier.DONOR &&
				e.isActiveAt(at),
		);

		const cosmeticIds = new Set(
			granted
				.filter((e) => e.grantType === GrantType.COSMETIC && e.isActiveAt(at))
				.map((e) => e.grantValue),
		);

		const tier = isDonor ? CosmeticTier.DONOR : CosmeticTier.REGISTERED;
		return new CosmeticAccess(tier, cosmeticIds);
	}

	async canUse(
		userId: string,
		cosmetic: { id: string; tier: CosmeticTier },
		at: Date = new Date(),
	): Promise<boolean> {
		return (await this.accessFor(userId, at)).canUse(cosmetic);
	}
}
