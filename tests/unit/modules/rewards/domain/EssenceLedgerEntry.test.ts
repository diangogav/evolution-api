import { describe, expect, it } from "bun:test";

import {
	essenceLedgerEntry,
	InvalidEssenceLedgerEntryError,
} from "../../../../../src/modules/rewards/domain/EssenceLedgerEntry";

describe("essenceLedgerEntry", () => {
	it("builds a credit entry with a positive integer delta", () => {
		const entry = essenceLedgerEntry({
			userId: "user-1",
			kind: "mission",
			referenceKey: "win_1:2026-10-23",
			delta: 20,
		});

		expect(entry).toEqual({
			userId: "user-1",
			kind: "mission",
			referenceKey: "win_1:2026-10-23",
			delta: 20,
		});
	});

	it("builds a debit entry with a negative integer delta", () => {
		const entry = essenceLedgerEntry({
			userId: "user-1",
			kind: "purchase",
			referenceKey: "11111111-1111-4111-8111-111111111111",
			delta: -300,
		});

		expect(entry.delta).toBe(-300);
	});

	it("rejects a zero delta: a movement that moves nothing is a bug, not a row", () => {
		expect(() =>
			essenceLedgerEntry({ userId: "user-1", kind: "adjustment", referenceKey: "x", delta: 0 }),
		).toThrow(InvalidEssenceLedgerEntryError);
	});

	it("rejects a non-integer delta so the balance stays an integer", () => {
		expect(() =>
			essenceLedgerEntry({ userId: "user-1", kind: "adjustment", referenceKey: "x", delta: 1.5 }),
		).toThrow(InvalidEssenceLedgerEntryError);
	});

	it("rejects an empty reference key because idempotency depends on it", () => {
		expect(() =>
			essenceLedgerEntry({ userId: "user-1", kind: "adjustment", referenceKey: " ", delta: 5 }),
		).toThrow(InvalidEssenceLedgerEntryError);
	});
});
