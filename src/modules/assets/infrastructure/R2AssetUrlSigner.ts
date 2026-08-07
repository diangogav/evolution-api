import { S3Client } from "bun";

import { AssetUrlSigner, SignedAssetManifest } from "../domain/AssetUrlSigner";

/**
 * Signs read URLs for assets stored in a private R2 (S3-compatible) bucket.
 *
 * presign() is synchronous in Bun: it builds a SigV4-signed URL locally, with no
 * network round-trip. The bucket stays private; clients fetch binaries directly
 * from R2 using these short-lived URLs, never through this service.
 */
export class R2AssetUrlSigner implements AssetUrlSigner {
	constructor(
		private readonly client: S3Client,
		private readonly ttlSeconds: number,
		private readonly clock: () => number = Date.now,
	) {}

	sign(assetRef: string): string {
		return this.client.presign(assetRef, { expiresIn: this.ttlSeconds, method: "GET" });
	}

	signMany(assetRefs: string[]): Record<string, string> {
		return Object.fromEntries(assetRefs.map((ref) => [ref, this.sign(ref)]));
	}

	async signManifest(prefix: string, assetFiles?: readonly string[]): Promise<SignedAssetManifest> {
		const files = assetFiles ?? (await this.listRelativeFiles(prefix));
		const expiresAt = new Date(this.clock() + this.ttlSeconds * 1_000).toISOString();

		const assets = Object.fromEntries(files.map((file) => [file, this.sign(`${prefix}${file}`)]));

		return { assets, expiresAt };
	}

	private async listRelativeFiles(prefix: string): Promise<string[]> {
		const listed = await this.client.list({ prefix });
		return (listed.contents ?? [])
			.map((object) => object.key)
			.filter((key): key is string => Boolean(key) && !key?.endsWith("/"))
			.map((key) => key.slice(prefix.length));
	}
}
