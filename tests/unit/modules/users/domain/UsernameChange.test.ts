import { describe, expect, it } from "bun:test";

import {
	nextUsernameChangeAt,
	USERNAME_CHANGE_COOLDOWN_DAYS,
} from "../../../../../src/modules/user/domain/UsernameChange";

describe("nextUsernameChangeAt", () => {
	it("allows the next change 30 days after the previous one", () => {
		const next = nextUsernameChangeAt(new Date("2026-11-01T10:00:00.000Z"));

		expect(USERNAME_CHANGE_COOLDOWN_DAYS).toBe(30);
		expect(next.toISOString()).toBe("2026-12-01T10:00:00.000Z");
	});
});
