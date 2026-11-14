import type { CosmeticAssetStorage } from "../domain/CosmeticAssetStorage";
import { type CosmeticFile, contentTypeFor } from "../domain/CosmeticFiles";

/** A card frame kit carries up to 200 files: upload several at once so a publish answers in seconds. */
const UPLOAD_CONCURRENCY = 8;

/**
 * Uploads every file into the cosmetic's folder, a few at a time, recording each stored
 * key in `uploaded` so the caller can act on a failure. After the first failure no new
 * upload starts; the ones in flight finish before the error is rethrown.
 */
export async function uploadCosmeticFiles(
	storage: CosmeticAssetStorage,
	assetRef: string,
	files: readonly CosmeticFile[],
	uploaded: string[],
): Promise<void> {
	let next = 0;
	let failure: unknown;
	const worker = async (): Promise<void> => {
		while (failure === undefined && next < files.length) {
			const file = files[next++];
			const key = `${assetRef}${file.name}`;
			try {
				await storage.put({ key, bytes: file.bytes, contentType: contentTypeFor(file.name) });
				uploaded.push(key);
			} catch (error) {
				failure ??= error;
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker));
	if (failure !== undefined) throw failure;
}
