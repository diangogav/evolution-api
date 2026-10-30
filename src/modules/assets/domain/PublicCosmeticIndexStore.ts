/**
 * Publishes the list of asset refs the public CDN route may serve. Anything missing
 * from the list stays private behind signed URLs.
 */
export interface PublicCosmeticIndexStore {
	write(assetRefs: readonly string[]): Promise<void>;
}
