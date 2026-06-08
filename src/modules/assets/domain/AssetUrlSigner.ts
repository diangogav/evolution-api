export interface AssetUrlSigner {
	/** Signs a short-lived read (GET) URL for a single asset reference. */
	sign(assetRef: string): string;

	/** Signs many asset references at once, keyed by their reference. */
	signMany(assetRefs: string[]): Record<string, string>;

	/**
	 * Signs every object under a folder prefix, keyed by its path relative to the
	 * prefix (e.g. "render.jpg", "model.gltf"). Async because it lists the bucket.
	 * Lets clients fetch a multi-file asset (a gltf plus its .bin/texture, or a
	 * sleeve's render + preview) whose parts each need their own signed URL.
	 */
	signManifest(prefix: string): Promise<Record<string, string>>;
}
