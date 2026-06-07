export interface AssetUrlSigner {
	/** Signs a short-lived read (GET) URL for a single asset reference. */
	sign(assetRef: string): string;

	/** Signs many asset references at once, keyed by their reference. */
	signMany(assetRefs: string[]): Record<string, string>;
}
