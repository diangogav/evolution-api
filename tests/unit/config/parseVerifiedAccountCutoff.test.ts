import { describe, expect, it } from "bun:test";

import { parseVerifiedAccountCutoff } from "../../../src/config";

describe("parseVerifiedAccountCutoff", () => {
	it("exempts nobody by age when the variable is unset or blank", () => {
		expect(parseVerifiedAccountCutoff(undefined)).toBeNull();
		expect(parseVerifiedAccountCutoff(" ")).toBeNull();
	});

	it("reads an ISO 8601 instant", () => {
		expect(parseVerifiedAccountCutoff("2026-11-24T00:00:00Z")).toEqual(
			new Date("2026-11-24T00:00:00Z"),
		);
	});

	it("ignores a value that is not a date", () => {
		expect(parseVerifiedAccountCutoff("next tuesday")).toBeNull();
	});
});
