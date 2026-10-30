import type { CosmeticAssetStorage } from "../domain/CosmeticAssetStorage";
import { createR2Client } from "./createR2Client";
import { R2CosmeticAssetStorage } from "./R2CosmeticAssetStorage";

export function createR2CosmeticAssetStorage(): CosmeticAssetStorage {
	return new R2CosmeticAssetStorage(createR2Client());
}
