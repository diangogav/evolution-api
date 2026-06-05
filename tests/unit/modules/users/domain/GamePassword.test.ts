import { describe, expect, it } from "bun:test";

import { GamePassword } from "../../../../../src/modules/user/domain/GamePassword";

describe("GamePassword", () => {
	it("generates a 4-character value from the allowed charset", () => {
		const gamePassword = GamePassword.generate();

		expect(gamePassword.value).toMatch(/^[a-zA-Z0-9]{4}$/);
	});

	it("generates a different value on each call (not a constant)", () => {
		const values = new Set(Array.from({ length: 20 }, () => GamePassword.generate().value));

		expect(values.size).toBeGreaterThan(1);
	});
});
