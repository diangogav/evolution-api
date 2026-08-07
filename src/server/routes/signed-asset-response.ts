import type { Context } from "elysia";

export const SIGNED_ASSET_CACHE_CONTROL = "private, no-store";

export function preventSignedAssetResponseCaching(set: Context["set"]): void {
	set.headers["Cache-Control"] = SIGNED_ASSET_CACHE_CONTROL;
}
