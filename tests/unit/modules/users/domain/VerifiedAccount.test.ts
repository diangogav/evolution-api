import { describe, expect, it } from "bun:test";

import { isVerifiedAccount } from "../../../../../src/modules/user/domain/VerifiedAccount";

const CUTOFF = new Date("2026-11-24T00:00:00Z");
const UNCONFIRMED = { emailVerifiedAt: null, discordId: null, createdAt: null };

describe("isVerifiedAccount", () => {
	it("accepts an account that confirmed its email", () => {
		const account = {
			...UNCONFIRMED,
			emailVerifiedAt: new Date("2026-11-25T00:00:00Z"),
			createdAt: new Date("2026-11-25T00:00:00Z"),
		};

		expect(isVerifiedAccount(account, CUTOFF)).toBe(true);
	});

	it("accepts an account with a linked Discord", () => {
		const account = {
			...UNCONFIRMED,
			discordId: "discord-1",
			createdAt: new Date("2026-11-25T00:00:00Z"),
		};

		expect(isVerifiedAccount(account, CUTOFF)).toBe(true);
	});

	it("accepts an account created before the cutoff", () => {
		const account = { ...UNCONFIRMED, createdAt: new Date("2026-11-23T23:59:59Z") };

		expect(isVerifiedAccount(account, CUTOFF)).toBe(true);
	});

	it.each([
		["at", CUTOFF],
		["after", new Date("2026-11-24T00:00:01Z")],
	])("rejects an account created %s the cutoff without email or Discord", (_label, createdAt) => {
		expect(isVerifiedAccount({ ...UNCONFIRMED, createdAt }, CUTOFF)).toBe(false);
	});

	it("exempts nobody by age without a cutoff", () => {
		const account = { ...UNCONFIRMED, createdAt: new Date("2020-01-01T00:00:00Z") };

		expect(isVerifiedAccount(account, null)).toBe(false);
	});

	it("rejects an account whose creation date is unknown", () => {
		expect(isVerifiedAccount(UNCONFIRMED, CUTOFF)).toBe(false);
	});
});
