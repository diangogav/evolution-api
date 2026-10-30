import type { ActiveCosmeticRefs } from "../domain/ActiveCosmeticRefs";
import type { AssetUrlSigner, SignedAssetManifest } from "../domain/AssetUrlSigner";

/**
 * Serves active cosmetics from fixed public URLs so browsers and the service worker
 * can cache them across sessions; published assets are immutable because an assetRef
 * is never reused. Anything not active falls through to the inner signer and stays
 * private.
 */
export class PublicFirstAssetUrlSigner implements AssetUrlSigner {
	constructor(
		private readonly inner: AssetUrlSigner,
		private readonly publicBaseUrl: string,
		private readonly activeRefs: Pick<ActiveCosmeticRefs, "has">,
	) {}

	sign(assetRef: string): string {
		return this.inner.sign(assetRef);
	}

	signMany(assetRefs: string[]): Record<string, string> {
		return this.inner.signMany(assetRefs);
	}

	async signManifest(prefix: string, assetFiles?: readonly string[]): Promise<SignedAssetManifest> {
		if (!this.activeRefs.has(prefix)) {
			return this.inner.signManifest(prefix, assetFiles);
		}

		// Without an indexed file list, the inner signer's listing is the only source of
		// names; its signed URLs are discarded.
		const files = assetFiles ?? Object.keys((await this.inner.signManifest(prefix)).assets);
		const assets = Object.fromEntries(
			files.map((file) => [file, this.publicUrl(`${prefix}${file}`)]),
		);

		return { assets, expiresAt: null };
	}

	private publicUrl(key: string): string {
		return `${this.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
	}
}
