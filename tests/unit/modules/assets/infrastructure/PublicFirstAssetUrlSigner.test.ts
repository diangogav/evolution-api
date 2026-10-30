import { describe, expect, it } from "bun:test";

import { ActiveCosmeticRefs } from "../../../../../src/modules/assets/domain/ActiveCosmeticRefs";
import type { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { PublicFirstAssetUrlSigner } from "../../../../../src/modules/assets/infrastructure/PublicFirstAssetUrlSigner";

const BASE = "https://cdn.example.com/cosmetics";

function fakeInner(listed: string[] = ["render.jpg", "preview.jpg"]) {
	const calls: { prefix: string; files?: readonly string[] }[] = [];
	const inner: AssetUrlSigner = {
		sign: (ref) => `signed:${ref}`,
		signMany: (refs) => Object.fromEntries(refs.map((ref) => [ref, `signed:${ref}`])),
		signManifest: async (prefix, files) => {
			calls.push({ prefix, files });
			return {
				assets: Object.fromEntries((files ?? listed).map((f) => [f, `signed:${prefix}${f}`])),
				expiresAt: "2030-01-01T00:00:00.000Z",
			};
		},
	};
	return { inner, calls };
}

function activeRefs(...refs: string[]): ActiveCosmeticRefs {
	const active = new ActiveCosmeticRefs();
	active.replace(refs);
	return active;
}

describe("PublicFirstAssetUrlSigner", () => {
	it("returns public URLs that never expire for an active cosmetic", async () => {
		const { inner } = fakeInner();
		const signer = new PublicFirstAssetUrlSigner(inner, BASE, activeRefs("sleeves/dragon/"));

		const manifest = await signer.signManifest("sleeves/dragon/", ["render.jpg", "preview.jpg"]);

		expect(manifest).toEqual({
			assets: {
				"render.jpg": `${BASE}/sleeves/dragon/render.jpg`,
				"preview.jpg": `${BASE}/sleeves/dragon/preview.jpg`,
			},
			expiresAt: null,
		});
	});

	it("encodes each path segment and keeps the separators", async () => {
		const { inner } = fakeInner();
		const signer = new PublicFirstAssetUrlSigner(inner, BASE, activeRefs("emote-packs/a b/"));

		const manifest = await signer.signManifest("emote-packs/a b/", ["x#1?.json"]);

		expect(manifest.assets["x#1?.json"]).toBe(`${BASE}/emote-packs/a%20b/x%231%3F.json`);
	});

	it("takes the file names from the inner manifest when assetFiles is absent", async () => {
		const { inner, calls } = fakeInner(["background.webp"]);
		const signer = new PublicFirstAssetUrlSigner(inner, BASE, activeRefs("playmats/kagura/"));

		const manifest = await signer.signManifest("playmats/kagura/");

		expect(calls).toEqual([{ prefix: "playmats/kagura/", files: undefined }]);
		expect(manifest).toEqual({
			assets: { "background.webp": `${BASE}/playmats/kagura/background.webp` },
			expiresAt: null,
		});
	});

	it("delegates unchanged when the cosmetic is not active", async () => {
		const { inner, calls } = fakeInner();
		const signer = new PublicFirstAssetUrlSigner(inner, BASE, activeRefs("sleeves/other/"));

		const manifest = await signer.signManifest("sleeves/dragon/", ["render.jpg"]);

		expect(calls).toEqual([{ prefix: "sleeves/dragon/", files: ["render.jpg"] }]);
		expect(manifest).toEqual({
			assets: { "render.jpg": "signed:sleeves/dragon/render.jpg" },
			expiresAt: "2030-01-01T00:00:00.000Z",
		});
	});

	it("delegates sign and signMany", () => {
		const { inner } = fakeInner();
		const signer = new PublicFirstAssetUrlSigner(inner, BASE, activeRefs("sleeves/dragon/"));

		expect(signer.sign("sleeves/dragon/render.jpg")).toBe("signed:sleeves/dragon/render.jpg");
		expect(signer.signMany(["a", "b"])).toEqual({ a: "signed:a", b: "signed:b" });
	});

	it("follows the active set when it is replaced", async () => {
		const { inner } = fakeInner();
		const active = activeRefs();
		const signer = new PublicFirstAssetUrlSigner(inner, BASE, active);

		expect((await signer.signManifest("sleeves/dragon/", ["render.jpg"])).expiresAt).not.toBeNull();
		active.replace(["sleeves/dragon/"]);
		expect((await signer.signManifest("sleeves/dragon/", ["render.jpg"])).expiresAt).toBeNull();
	});
});
