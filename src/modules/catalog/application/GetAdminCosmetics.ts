import type { AssetUrlSigner } from "../domain/AssetUrlSigner";
import type { CosmeticRepository } from "../domain/CosmeticRepository";
import type { CosmeticTier } from "../domain/CosmeticTier";
import { type CosmeticUsageSource, NO_USAGE } from "../domain/CosmeticUsageSource";
import type { CosmeticType } from "../domain/CosmeticType";

export interface AdminCosmeticDto {
	readonly id: string;
	readonly type: CosmeticType;
	readonly tier: CosmeticTier;
	readonly assetRef: string;
	readonly displayName: string;
	readonly active: boolean;
	readonly assetFiles: readonly string[];
	readonly essencePrice: number | null;
	/** Names of the bots that wear it. */
	readonly bots: readonly string[];
	/** The events that give it away as a prize. */
	readonly prizeOf: readonly { readonly eventId: string; readonly name: string }[];
	readonly assets: Readonly<Record<string, string>>;
	readonly assetsExpiresAt: string | null;
}

export class GetAdminCosmetics {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly signer: AssetUrlSigner,
		// Optional so the list still answers where usage is not wired.
		private readonly usages?: CosmeticUsageSource,
	) {}

	async run(): Promise<AdminCosmeticDto[]> {
		const [cosmetics, usage] = await Promise.all([
			this.cosmetics.findAll(),
			this.usages?.usage() ?? new Map(),
		]);
		const catalog = await Promise.all(
			cosmetics.map(async (cosmetic) => {
				const manifest = await this.signer.signManifest(
					cosmetic.assetRef,
					cosmetic.assetFiles ?? undefined,
				);
				return {
					id: cosmetic.id,
					type: cosmetic.type,
					tier: cosmetic.tier,
					assetRef: cosmetic.assetRef,
					displayName: cosmetic.displayName,
					active: cosmetic.active,
					assetFiles: cosmetic.assetFiles ?? [],
					essencePrice: cosmetic.essencePrice,
					bots: (usage.get(cosmetic.id) ?? NO_USAGE).bots,
					prizeOf: (usage.get(cosmetic.id) ?? NO_USAGE).prizeOf,
					assets: manifest.assets,
					assetsExpiresAt: manifest.expiresAt,
				};
			}),
		);
		return catalog.sort((left, right) => left.displayName.localeCompare(right.displayName));
	}
}
