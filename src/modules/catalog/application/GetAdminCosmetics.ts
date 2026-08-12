import type { AssetUrlSigner } from "../../assets/domain/AssetUrlSigner";
import type { CosmeticRepository } from "../domain/CosmeticRepository";
import type { CompanionAnimationDescriptor } from "../domain/CompanionAnimation";
import type { CosmeticTier } from "../domain/CosmeticTier";
import type { CosmeticType } from "../domain/CosmeticType";

export interface AdminCosmeticDto {
	readonly id: string;
	readonly type: CosmeticType;
	readonly tier: CosmeticTier;
	readonly assetRef: string;
	readonly displayName: string;
	readonly active: boolean;
	readonly assetFiles: readonly string[];
	readonly animation?: CompanionAnimationDescriptor;
	readonly assets: Readonly<Record<string, string>>;
	readonly assetsExpiresAt: string;
}

export class GetAdminCosmetics {
	constructor(
		private readonly cosmetics: CosmeticRepository,
		private readonly signer: AssetUrlSigner,
	) {}

	async run(): Promise<AdminCosmeticDto[]> {
		const cosmetics = await this.cosmetics.findAll();
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
					...(cosmetic.animation ? { animation: cosmetic.animation } : {}),
					assets: manifest.assets,
					assetsExpiresAt: manifest.expiresAt,
				};
			}),
		);
		return catalog.sort((left, right) => left.displayName.localeCompare(right.displayName));
	}
}
