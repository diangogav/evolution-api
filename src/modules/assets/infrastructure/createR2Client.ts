import { S3Client } from "bun";

import { config } from "../../../config";

/** Bun S3 client against the private R2 bucket that holds cosmetic assets. */
export function createR2Client(): S3Client {
	return new S3Client({
		accessKeyId: config.r2.accessKeyId,
		secretAccessKey: config.r2.secretAccessKey,
		bucket: config.r2.bucket,
		endpoint: config.r2.endpoint,
	});
}
