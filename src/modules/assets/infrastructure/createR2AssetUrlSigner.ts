import { config } from "../../../config";
import type { ActiveCosmeticRefs } from "../domain/ActiveCosmeticRefs";
import type { AssetUrlSigner } from "../domain/AssetUrlSigner";
import { activeCosmeticRefs } from "./activeCosmeticRefs";
import { createR2Client } from "./createR2Client";
import { PublicFirstAssetUrlSigner } from "./PublicFirstAssetUrlSigner";
import { R2AssetUrlSigner } from "./R2AssetUrlSigner";

export interface AssetUrlSignerOptions {
	readonly publicBaseUrl: string | undefined;
	readonly activeRefs: Pick<ActiveCosmeticRefs, "has">;
}

/**
 * Composition root for the asset URL signer. Builds the Bun S3 client against the
 * private R2 bucket and wires it into the adapter, so consumers depend only on the
 * AssetUrlSigner port and never on how the client is constructed. With a public base
 * URL configured, active cosmetics get public URLs and the rest stay signed.
 */
export function createR2AssetUrlSigner(
	options: AssetUrlSignerOptions = {
		publicBaseUrl: config.cosmeticsPublicBaseUrl,
		activeRefs: activeCosmeticRefs,
	},
): AssetUrlSigner {
	const signer = new R2AssetUrlSigner(createR2Client(), config.r2.signedUrlTtlSeconds);
	if (!options.publicBaseUrl) {
		return signer;
	}

	return new PublicFirstAssetUrlSigner(signer, options.publicBaseUrl, options.activeRefs);
}
