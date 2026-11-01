import { describe, expect, it } from "bun:test";
import {
	playerReportDetails,
	reviewNote,
} from "../../../../../src/modules/player-reports/domain/PlayerReportText";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";

describe("Player report text", () => {
	for (const { name, factory, minimum } of [
		{ name: "details", factory: playerReportDetails, minimum: 10 },
		{ name: "review note", factory: reviewNote, minimum: 3 },
	]) {
		it(`counts ${name} limits in Unicode code points like PostgreSQL`, () => {
			for (const character of ["a", "😀"]) {
				expect(() => factory(character.repeat(minimum - 1))).toThrow(InvalidArgumentError);
				expect(factory(character.repeat(minimum))).toBe(character.repeat(minimum));
				expect(factory(character.repeat(2000))).toBe(character.repeat(2000));
				expect(() => factory(character.repeat(2001))).toThrow(InvalidArgumentError);
			}
		});
		it(`trims ${name} and rejects controls and invalid Unicode before storage`, () => {
			const text = "Meaningful text 😀";
			expect(factory("  \n" + text + "\t ")).toBe(text);
			expect(factory(text + "\tline\nbreak")).toBe(text + "\tline\nbreak");
			for (const invalid of [" ".repeat(20), text + "\0", text + "\u007f", text + "\ud800"]) {
				expect(() => factory(invalid)).toThrow(InvalidArgumentError);
			}
		});
	}
});
