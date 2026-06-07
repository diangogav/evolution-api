import { S3Client } from "bun";

import { config } from "../../../config";
import { AssetUrlSigner } from "../domain/AssetUrlSigner";
import { R2AssetUrlSigner } from "./R2AssetUrlSigner";

/**
 * Composition root for the asset URL signer. Builds the Bun S3 client against the
 * private R2 bucket and wires it into the adapter, so consumers depend only on the
 * AssetUrlSigner port and never on how the client is constructed.
 */
export function createR2AssetUrlSigner(): AssetUrlSigner {
	const client = new S3Client({
		accessKeyId: config.r2.accessKeyId,
		secretAccessKey: config.r2.secretAccessKey,
		bucket: config.r2.bucket,
		endpoint: config.r2.endpoint,
	});

	return new R2AssetUrlSigner(client, config.r2.signedUrlTtlSeconds);
}
