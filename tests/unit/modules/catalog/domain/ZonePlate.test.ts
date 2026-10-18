import { describe, expect, it } from "bun:test";

import { parseZonePlate } from "../../../../../src/modules/catalog/domain/ZonePlate";

const valid = { version: 1, base: "#c98a3a", accent: "#f0c070", rim: "#8a5a2a" };

describe("parseZonePlate", () => {
	it("parses base, accent and rim", () => {
		expect(parseZonePlate(JSON.stringify(valid))).toEqual({
			base: "#c98a3a",
			accent: "#f0c070",
			rim: "#8a5a2a",
		});
	});

	it("accepts bytes and treats rim as optional", () => {
		const bytes = new TextEncoder().encode(
			JSON.stringify({ version: 1, base: "#C98A3A", accent: "#f0c070" }),
		);

		expect(parseZonePlate(bytes)).toEqual({ base: "#C98A3A", accent: "#f0c070" });
	});

	it("ignores unknown keys", () => {
		const plate = parseZonePlate(JSON.stringify({ ...valid, emblem: "star" }));

		expect(plate).not.toHaveProperty("emblem");
	});

	it("rejects invalid JSON and non-object roots", () => {
		expect(() => parseZonePlate("{nope")).toThrow("not valid JSON");
		expect(() => parseZonePlate("[]")).toThrow("must be a JSON object");
		expect(() => parseZonePlate("null")).toThrow("must be a JSON object");
	});

	it("requires version 1", () => {
		expect(() => parseZonePlate(JSON.stringify({ ...valid, version: 2 }))).toThrow(
			"version must be 1",
		);
		const { version: _version, ...noVersion } = valid;
		expect(() => parseZonePlate(JSON.stringify(noVersion))).toThrow("version must be 1");
	});

	it("requires base and accent as #rrggbb", () => {
		for (const bad of ["red", "#fff", "#gggggg", "c98a3a", 12, null]) {
			expect(() => parseZonePlate(JSON.stringify({ ...valid, base: bad }))).toThrow("base");
			expect(() => parseZonePlate(JSON.stringify({ ...valid, accent: bad }))).toThrow("accent");
		}
		const { base: _base, ...noBase } = valid;
		expect(() => parseZonePlate(JSON.stringify(noBase))).toThrow("base");
	});

	it("rejects a present but malformed rim", () => {
		expect(() => parseZonePlate(JSON.stringify({ ...valid, rim: "#12" }))).toThrow("rim");
	});
});
