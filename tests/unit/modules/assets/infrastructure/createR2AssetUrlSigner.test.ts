import { describe, expect, it } from "bun:test";

import { ActiveCosmeticRefs } from "../../../../../src/modules/assets/domain/ActiveCosmeticRefs";
import { createR2AssetUrlSigner } from "../../../../../src/modules/assets/infrastructure/createR2AssetUrlSigner";
import { PublicFirstAssetUrlSigner } from "../../../../../src/modules/assets/infrastructure/PublicFirstAssetUrlSigner";
import { R2AssetUrlSigner } from "../../../../../src/modules/assets/infrastructure/R2AssetUrlSigner";

describe("createR2AssetUrlSigner", () => {
	it("returns the plain R2 signer when no public base URL is configured", () => {
		const signer = createR2AssetUrlSigner({
			publicBaseUrl: undefined,
			activeRefs: new ActiveCosmeticRefs(),
		});

		expect(signer).toBeInstanceOf(R2AssetUrlSigner);
	});

	it("wraps the R2 signer public-first when a public base URL is configured", async () => {
		const activeRefs = new ActiveCosmeticRefs();
		activeRefs.replace(["sleeves/dragon/"]);
		const signer = createR2AssetUrlSigner({
			publicBaseUrl: "https://cdn.example.com/cosmetics",
			activeRefs,
		});

		expect(signer).toBeInstanceOf(PublicFirstAssetUrlSigner);
		expect(await signer.signManifest("sleeves/dragon/", ["render.jpg"])).toEqual({
			assets: { "render.jpg": "https://cdn.example.com/cosmetics/sleeves/dragon/render.jpg" },
			expiresAt: null,
		});
	});
});
