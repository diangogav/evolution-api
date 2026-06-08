import { CosmeticTier } from "../../catalog/domain/CosmeticTier";
import { tierGrants } from "../domain/accessTier";
import { EntitlementRepository } from "../domain/EntitlementRepository";
import { GrantType } from "../domain/GrantType";

// The single access gate for cosmetics. Every access check must pass through here
// — callers never compare tiers themselves (RFC §8). Today it resolves an ordinal
// tier; new access sources (purchases, donation ranks) plug in here without
// changing any caller.
export class EntitlementsGatekeeper {
	constructor(private readonly entitlements: EntitlementRepository) {}

	async canUse(
		userId: string,
		cosmetic: { tier: CosmeticTier },
		at: Date = new Date(),
	): Promise<boolean> {
		const userTier = await this.deriveTier(userId, at);
		return tierGrants(userTier, cosmetic.tier);
	}

	private async deriveTier(userId: string, at: Date): Promise<CosmeticTier> {
		const granted = await this.entitlements.findByUserId(userId);

		const isDonor = granted.some(
			(entitlement) =>
				entitlement.grantType === GrantType.TIER &&
				entitlement.grantValue === CosmeticTier.DONOR &&
				entitlement.isActiveAt(at),
		);

		// Authenticated users are registered at minimum; donor when actively granted.
		return isDonor ? CosmeticTier.DONOR : CosmeticTier.REGISTERED;
	}
}
