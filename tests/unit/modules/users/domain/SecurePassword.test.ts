import { describe, expect, it } from "bun:test";

import { SecurePassword } from "../../../../../src/modules/user/domain/SecurePassword";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";

describe("SecurePassword", () => {
	it("creates a valid secure password and exposes its value", () => {
		const password = SecurePassword.create("yugi2024");

		expect(password.value).toBe("yugi2024");
	});

	it("throws when shorter than 8 characters", () => {
		expect(() => SecurePassword.create("yugi24")).toThrow(InvalidArgumentError);
	});

	it("throws when it has no letter", () => {
		expect(() => SecurePassword.create("12345678")).toThrow(InvalidArgumentError);
	});

	it("throws when it has no digit", () => {
		expect(() => SecurePassword.create("password")).toThrow(InvalidArgumentError);
	});
});
