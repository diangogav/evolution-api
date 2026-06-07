import { S3Client } from "bun";

import { AssetUrlSigner } from "../domain/AssetUrlSigner";

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
	) {}

	sign(assetRef: string): string {
		return this.client.presign(assetRef, { expiresIn: this.ttlSeconds, method: "GET" });
	}

	signMany(assetRefs: string[]): Record<string, string> {
		return Object.fromEntries(assetRefs.map((ref) => [ref, this.sign(ref)]));
	}
}
