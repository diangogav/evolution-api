export interface CosmeticAssetUpload {
	readonly key: string;
	readonly bytes: Uint8Array;
	readonly contentType: string;
}

/** Private object-storage port used by administrative cosmetic publication. */
export interface CosmeticAssetStorage {
	put(upload: CosmeticAssetUpload): Promise<void>;
	delete(key: string): Promise<void>;
}
