import { describe, expect, it } from "bun:test";

import { parseCosmeticsPublicBaseUrl } from "../../../src/config";

describe("parseCosmeticsPublicBaseUrl", () => {
	it("is undefined when the variable is unset or blank", () => {
		expect(parseCosmeticsPublicBaseUrl(undefined)).toBeUndefined();
		expect(parseCosmeticsPublicBaseUrl("  ")).toBeUndefined();
	});

	it("accepts an http(s) URL and strips trailing slashes", () => {
		expect(parseCosmeticsPublicBaseUrl("https://cdn.example.com/cosmetics/")).toBe(
			"https://cdn.example.com/cosmetics",
		);
		expect(parseCosmeticsPublicBaseUrl(" http://localhost:8787/cosmetics ")).toBe(
			"http://localhost:8787/cosmetics",
		);
	});

	it("rejects values that are not http(s) URLs", () => {
		const message = "Environment variable COSMETICS_PUBLIC_BASE_URL must be an http(s) URL";
		expect(() => parseCosmeticsPublicBaseUrl("cdn.example.com")).toThrow(message);
		expect(() => parseCosmeticsPublicBaseUrl("ftp://cdn.example.com")).toThrow(message);
	});
});
