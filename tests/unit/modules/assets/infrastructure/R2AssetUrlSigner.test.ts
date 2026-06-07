import { S3Client } from "bun";
import { describe, expect, it } from "bun:test";

import { R2AssetUrlSigner } from "../../../../../src/modules/assets/infrastructure/R2AssetUrlSigner";

describe("R2AssetUrlSigner", () => {
	// presign() signs locally with SigV4 — no network call — so fake credentials
	// are enough to assert the shape of the URL the client would receive.
	const client = new S3Client({
		accessKeyId: "test-access-key-id",
		secretAccessKey: "test-secret-access-key",
		bucket: "test-bucket",
		endpoint: "https://test-account.r2.cloudflarestorage.com",
	});
	const ttlSeconds = 600;

	it("signs a short-lived read URL for an asset reference", () => {
		const signer = new R2AssetUrlSigner(client, ttlSeconds);

		const url = signer.sign("sleeves/dragon.png");

		expect(url).toMatch(/^https:\/\//);
		expect(url).toContain("dragon.png");
		expect(url).toContain("X-Amz-Expires=600");
		expect(url).toContain("X-Amz-Signature=");
	});

	it("signs many references and keys each URL by its reference", () => {
		const signer = new R2AssetUrlSigner(client, ttlSeconds);
		const refs = ["sleeves/dragon.png", "playmats/arena.png"];

		const urls = signer.signMany(refs);

		expect(Object.keys(urls)).toEqual(refs);
		for (const ref of refs) {
			const fileName = ref.split("/")[1];
			expect(urls[ref]).toMatch(/^https:\/\//);
			expect(urls[ref]).toContain(fileName);
			expect(urls[ref]).toContain("X-Amz-Expires=600");
		}
	});
});
