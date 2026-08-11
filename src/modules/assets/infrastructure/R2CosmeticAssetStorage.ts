import { S3Client } from "bun";

import { ConflictError } from "../../../shared/errors/ConflictError";
import type { CosmeticAssetStorage, CosmeticAssetUpload } from "../domain/CosmeticAssetStorage";

/** Writes private cosmetic objects to R2 and verifies the persisted byte size. */
export class R2CosmeticAssetStorage implements CosmeticAssetStorage {
	constructor(private readonly client: S3Client) {}

	async put(upload: CosmeticAssetUpload): Promise<void> {
		const target = this.client.file(upload.key);
		if (await target.exists()) {
			throw new ConflictError(`Asset "${upload.key}" already exists`);
		}

		const written = await this.client.write(upload.key, upload.bytes, {
			type: upload.contentType,
		});

		try {
			const persisted = await target.stat();
			if (written !== upload.bytes.byteLength || persisted.size !== upload.bytes.byteLength) {
				throw new Error(
					`R2 upload size mismatch for "${upload.key}": local=${upload.bytes.byteLength}, write=${written}, remote=${persisted.size}`,
				);
			}
		} catch (error) {
			await target.delete().catch(() => undefined);
			throw error;
		}
	}

	async delete(key: string): Promise<void> {
		await this.client.delete(key);
	}
}
