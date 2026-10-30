import type { S3Client } from "bun";

import type { PublicCosmeticIndexStore } from "../domain/PublicCosmeticIndexStore";

/** Lives outside every cosmetic prefix, so asset syncs never touch it. */
export const PUBLIC_COSMETIC_INDEX_KEY = "_public/cosmetics-index.json";

/** Writes the public cosmetic index the CDN route reads before serving a file. */
export class R2PublicCosmeticIndexStore implements PublicCosmeticIndexStore {
	constructor(private readonly client: Pick<S3Client, "write">) {}

	async write(assetRefs: readonly string[]): Promise<void> {
		const body = JSON.stringify({ version: 1, assetRefs: [...assetRefs].sort() });
		await this.client.write(PUBLIC_COSMETIC_INDEX_KEY, body, { type: "application/json" });
	}
}
