import { describe, expect, it } from "bun:test";

import {
	assertVectorLottie,
	MAX_LOTTIE_BYTES,
	MAX_LOTTIE_SECONDS,
} from "../../../../../src/modules/catalog/domain/LottieAnimation";

function lottie(overrides: Record<string, unknown> = {}): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify({
			v: "5.7.4",
			fr: 30,
			ip: 0,
			op: 60,
			w: 512,
			h: 512,
			assets: [],
			layers: [{ ty: 4, nm: "shape", shapes: [] }],
			...overrides,
		}),
	);
}

function reject(bytes: Uint8Array, message: string): void {
	expect(() => assertVectorLottie("wave.json", bytes)).toThrow(message);
}

describe("assertVectorLottie", () => {
	it("accepts a vector-only animation", () => {
		expect(() => assertVectorLottie("wave.json", lottie())).not.toThrow();
	});

	it("accepts precomposition assets that only hold layers", () => {
		const bytes = lottie({ assets: [{ id: "comp_0", layers: [{ ty: 4, shapes: [] }] }] });
		expect(() => assertVectorLottie("wave.json", bytes)).not.toThrow();
	});

	it("rejects a file above the size cap", () => {
		reject(new Uint8Array(MAX_LOTTIE_BYTES + 1), "wave.json exceeds 200 KB");
	});

	it("rejects bytes that are not JSON", () => {
		reject(new TextEncoder().encode("{nope"), "wave.json is not valid JSON");
	});

	it("rejects JSON that is not an object", () => {
		reject(new TextEncoder().encode("[]"), "wave.json must be a JSON object");
	});

	it("rejects a missing or non-string version", () => {
		reject(lottie({ v: 5 }), "wave.json must declare a version string in v");
		reject(lottie({ v: "latest" }), "wave.json must declare a version string in v");
	});

	it("rejects a non-positive frame rate", () => {
		reject(lottie({ fr: 0 }), "wave.json requires a frame rate fr greater than 0");
	});

	it("rejects missing numeric bounds", () => {
		reject(lottie({ ip: "0" }), "wave.json requires numeric ip, op, w and h");
		reject(lottie({ w: undefined }), "wave.json requires numeric ip, op, w and h");
	});

	it("rejects an out point that is not after the in point", () => {
		reject(lottie({ ip: 10, op: 10 }), "wave.json requires op greater than ip");
	});

	it("rejects missing layers", () => {
		reject(lottie({ layers: undefined }), "wave.json requires a layers array");
	});

	it("rejects an animation longer than 3 seconds", () => {
		expect(MAX_LOTTIE_SECONDS).toBe(3);
		reject(lottie({ fr: 30, ip: 0, op: 91 }), "wave.json lasts longer than 3 seconds");
	});

	it("accepts an animation of exactly 3 seconds", () => {
		expect(() => assertVectorLottie("wave.json", lottie({ fr: 30, ip: 0, op: 90 }))).not.toThrow();
	});

	it("rejects embedded image assets", () => {
		const bytes = lottie({ assets: [{ id: "image_0", p: "data:image/png;base64,AAAA", u: "" }] });
		reject(bytes, "wave.json embeds an image or external asset");
	});

	it("rejects external asset references", () => {
		reject(
			lottie({ assets: [{ id: "image_0", u: "https://example.com/" }] }),
			"wave.json embeds an image or external asset",
		);
	});

	it("rejects fonts and glyph data", () => {
		reject(lottie({ fonts: { list: [] } }), "wave.json must not declare fonts or chars");
		reject(lottie({ chars: [] }), "wave.json must not declare fonts or chars");
	});

	it("rejects text layers at the root and inside precompositions", () => {
		reject(lottie({ layers: [{ ty: 5 }] }), "wave.json contains a text layer");
		reject(
			lottie({ assets: [{ id: "comp_0", layers: [{ ty: 5 }] }] }),
			"wave.json contains a text layer",
		);
	});

	it("rejects expressions anywhere in the tree", () => {
		const bytes = lottie({
			layers: [{ ty: 4, ks: { r: { a: 0, k: 0, x: "time * 10" } }, shapes: [] }],
		});
		reject(bytes, "wave.json contains an expression");
	});

	it("does not mistake a numeric x property for an expression", () => {
		const bytes = lottie({ layers: [{ ty: 4, shapes: [{ ty: "rc", x: 3 }] }] });
		expect(() => assertVectorLottie("wave.json", bytes)).not.toThrow();
	});
});
