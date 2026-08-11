import { S3Client } from "bun";

import { config } from "../../../config";
import type { CosmeticAssetStorage } from "../domain/CosmeticAssetStorage";
import { R2CosmeticAssetStorage } from "./R2CosmeticAssetStorage";

export function createR2CosmeticAssetStorage(): CosmeticAssetStorage {
	return new R2CosmeticAssetStorage(
		new S3Client({
			accessKeyId: config.r2.accessKeyId,
			secretAccessKey: config.r2.secretAccessKey,
			bucket: config.r2.bucket,
			endpoint: config.r2.endpoint,
		}),
	);
}
