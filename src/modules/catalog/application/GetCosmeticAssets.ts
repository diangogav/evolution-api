import { AssetUrlSigner } from "../../assets/domain/AssetUrlSigner";
import { EntitlementsGatekeeper } from "../../entitlements/application/EntitlementsGatekeeper";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { CosmeticRepository } from "../domain/CosmeticRepository";

export interface CosmeticAssets {
	assets: Record<string, string>;
	assetsExpiresAt: string;
}

/** Refreshes one cosmetic manifest without re-signing the whole catalog. */
export class GetCosmeticAssets {
	constructor(
		private readonly repository: CosmeticRepository,
		private readonly signer: AssetUrlSigner,
		private readonly gatekeeper: EntitlementsGatekeeper,
	) {}

	async run(cosmeticId: string, userId: string | null): Promise<CosmeticAssets> {
		const cosmetic = await this.repository.findById(cosmeticId);
		const access = await this.gatekeeper.accessFor(userId);

		// Use the same not-found response for unknown, inactive, and inaccessible
		// cosmetics so the endpoint does not disclose gated catalog entries.
		if (!cosmetic || !cosmetic.active || !access.canUse(cosmetic)) {
			throw new NotFoundError(`Cosmetic "${cosmeticId}" not found`);
		}

		const signedManifest = await this.signer.signManifest(
			cosmetic.assetRef,
			cosmetic.assetFiles ?? undefined,
		);
		return {
			assets: signedManifest.assets,
			assetsExpiresAt: signedManifest.expiresAt,
		};
	}
}
