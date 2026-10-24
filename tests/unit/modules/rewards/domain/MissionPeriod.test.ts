import { describe, expect, it } from "bun:test";

import { periodKey } from "../../../../../src/modules/rewards/domain/MissionPeriod";

describe("periodKey", () => {
	it("keys a daily period by the UTC calendar day", () => {
		expect(periodKey("daily", new Date("2026-10-25T23:59:00Z"))).toBe("2026-10-25");
		expect(periodKey("daily", new Date("2026-10-26T00:01:00Z"))).toBe("2026-10-26");
	});

	it("keys a weekly period by the ISO week, so Sunday 2026-10-25 and Monday 2026-10-26 differ", () => {
		expect(periodKey("weekly", new Date("2026-10-25T23:59:00Z"))).toBe("2026-W43");
		expect(periodKey("weekly", new Date("2026-10-26T00:01:00Z"))).toBe("2026-W44");
	});

	it("keeps two days of the same ISO week under one weekly key", () => {
		expect(periodKey("weekly", new Date("2026-10-20T10:00:00Z"))).toBe("2026-W43");
		expect(periodKey("weekly", new Date("2026-10-23T10:00:00Z"))).toBe("2026-W43");
	});

	it("follows ISO rules at year boundaries", () => {
		expect(periodKey("weekly", new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
		expect(periodKey("weekly", new Date("2024-12-30T12:00:00Z"))).toBe("2025-W01");
	});
});
