import { describe, expect, it } from "bun:test";
import type { Context } from "elysia";

import {
	preventSignedAssetResponseCaching,
	SIGNED_ASSET_CACHE_CONTROL,
} from "../../../../src/server/routes/signed-asset-response";

describe("signed asset responses", () => {
	it("prevents browsers and intermediaries from caching bearer URLs", () => {
		const set = { headers: {} } as Context["set"];

		preventSignedAssetResponseCaching(set);

		expect(set.headers["Cache-Control"]).toBe(SIGNED_ASSET_CACHE_CONTROL);
		expect(SIGNED_ASSET_CACHE_CONTROL).toBe("private, no-store");
	});
});
