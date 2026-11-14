import { S3Client } from "bun";

import type { CosmeticAssetStorage, CosmeticAssetUpload } from "../../catalog";

/** Writes private cosmetic objects to R2, replacing what is there, and verifies the persisted byte size. */
export class R2CosmeticAssetStorage implements CosmeticAssetStorage {
	constructor(private readonly client: S3Client) {}

	async put(upload: CosmeticAssetUpload): Promise<void> {
		// An object already at the key is replaced. Which folder a cosmetic may write to is
		// decided against the catalog, by the use cases; refusing here would make it
		// impossible to update a cosmetic or to register one whose files were uploaded first.
		const target = this.client.file(upload.key);

		const written = await this.client.write(upload.key, upload.bytes, {
			type: upload.contentType,
		});

		try {
			const persisted = await this.listedSize(upload.key);
			if (written !== upload.bytes.byteLength || persisted !== upload.bytes.byteLength) {
				throw new Error(
					`R2 upload size mismatch for "${upload.key}": local=${upload.bytes.byteLength}, write=${written}, remote=${persisted ?? "missing"}`,
				);
			}
		} catch (error) {
			await target.delete().catch(() => undefined);
			throw error;
		}
	}

	/**
	 * Reads the stored size from a listing. `stat()` reported 0 bytes for a small
	 * JSON object that the listing showed was stored in full.
	 */
	private async listedSize(key: string): Promise<number | undefined> {
		const listed = await this.client.list({ prefix: key });
		return listed.contents?.find((object) => object.key === key)?.size;
	}

	async delete(key: string): Promise<void> {
		await this.client.delete(key);
	}
}
