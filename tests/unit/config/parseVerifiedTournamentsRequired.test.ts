import { describe, expect, it } from "bun:test";

import { parseVerifiedTournamentsRequired } from "../../../src/config";

describe("parseVerifiedTournamentsRequired", () => {
	it("is on for true or 1, ignoring case and spaces", () => {
		expect(parseVerifiedTournamentsRequired("true")).toBe(true);
		expect(parseVerifiedTournamentsRequired("TRUE")).toBe(true);
		expect(parseVerifiedTournamentsRequired(" True ")).toBe(true);
		expect(parseVerifiedTournamentsRequired("1")).toBe(true);
	});

	it("is off when unset or set to anything else", () => {
		expect(parseVerifiedTournamentsRequired(undefined)).toBe(false);
		expect(parseVerifiedTournamentsRequired("")).toBe(false);
		expect(parseVerifiedTournamentsRequired("false")).toBe(false);
		expect(parseVerifiedTournamentsRequired("0")).toBe(false);
		expect(parseVerifiedTournamentsRequired("yes")).toBe(false);
	});
});
