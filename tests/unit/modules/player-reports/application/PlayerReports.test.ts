import type { PlayerReportRepository } from "../../../../../src/modules/player-reports/domain/PlayerReportRepository";
import { describe, expect, it } from "bun:test";
import { SubmitPlayerReport } from "../../../../../src/modules/player-reports/application/SubmitPlayerReport";
import { ReviewPlayerReport } from "../../../../../src/modules/player-reports/application/ReviewPlayerReport";
import { ListReportableMatches } from "../../../../../src/modules/player-reports/application/ListReportableMatches";
import { GetPlayerReport } from "../../../../../src/modules/player-reports/application/GetPlayerReport";
import type { SubmitReportInput } from "../../../../../src/modules/player-reports/domain/PlayerReport";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";

const now = new Date("2026-10-31T12:00:00Z");
const input: SubmitReportInput = {
	reporterId: "a",
	reportedUserId: "b",
	gameId: "a0000000-0000-4000-8000-000000000001",
	reason: "stalling",
	details: "  Opponent repeatedly stalled.  ",
	now,
};
const receipt = {
	id: "9044b99a-e5ed-4c4f-88f5-7141e462ea9a",
	status: "open" as const,
	createdAt: now.toISOString(),
};
const repository = (overrides: Partial<PlayerReportRepository> = {}): PlayerReportRepository => ({
	listMatches: async () => [],
	submit: async () => ({ outcome: "accepted", receipt }),
	list: async () => [],
	get: async () => null,
	review: async () => ({ outcome: "missing" }),
	...overrides,
});
describe("Player report use cases", () => {
	it("trims allegations and returns only the report receipt", async () => {
		let received: SubmitReportInput | undefined;
		const submit = new SubmitPlayerReport(
			repository({
				submit: async (value) => {
					received = value;
					return { outcome: "accepted", receipt };
				},
			}),
		);
		expect(await submit.run(input)).toEqual(receipt);
		expect(received?.details).toBe("Opponent repeatedly stalled.");
		await submit.run({ ...input, gameId: input.gameId.toUpperCase() });
		expect(received?.gameId).toBe(input.gameId);
		expect(received?.reporterId).toBe("a");
		expect(received?.now).toBe(now);
	});
	it("rejects self-reports, invalid reason and unbounded or blank text before storage", async () => {
		let calls = 0;
		const submit = new SubmitPlayerReport(
			repository({
				submit: async () => {
					calls++;
					return { outcome: "accepted", receipt };
				},
			}),
		);
		for (const change of [
			{ reportedUserId: "a" },
			{ reason: "ban" },
			{ details: "          " },
			{ details: "x".repeat(2001) },
			{ details: "😀".repeat(5) },
			{ details: "😀".repeat(2001) },
			{ gameId: "" },
			{ gameId: "not-a-uuid" },
			{ gameId: "{a0000000-0000-4000-8000-000000000001}" },
			{ gameId: "a0000000000040008000000000000001" },
		])
			await expect(submit.run({ ...input, ...change } as SubmitReportInput)).rejects.toThrow(
				InvalidArgumentError,
			);
		expect(calls).toBe(0);
	});
	it("stores the full code-point allowance without UTF-16 truncation", async () => {
		let received: SubmitReportInput | undefined;
		const submit = new SubmitPlayerReport(
			repository({
				submit: async (value) => {
					received = value;
					return { outcome: "accepted", receipt };
				},
			}),
		);
		const details = "😀".repeat(2000);
		expect(await submit.run({ ...input, details })).toEqual(receipt);
		expect(received?.details).toBe(details);
	});
	it("maps missing match and quota failures without inventing a successful receipt", async () => {
		await expect(
			new SubmitPlayerReport(repository({ submit: async () => ({ outcome: "ineligible" }) })).run(
				input,
			),
		).rejects.toThrow(NotFoundError);
		await expect(
			new SubmitPlayerReport(repository({ submit: async () => ({ outcome: "quota" }) })).run(input),
		).rejects.toThrow(ConflictError);
	});
	it("bounds history and requires existing detail rows", async () => {
		await expect(new GetPlayerReport(repository()).run(receipt.id)).rejects.toThrow(NotFoundError);
		expect(() =>
			new ListReportableMatches(repository()).run({ reporterId: "a", page: 1, limit: 51, now }),
		).toThrow(InvalidArgumentError);
	});
	it("requires a meaningful admin note and refuses stale reviews", async () => {
		const review = new ReviewPlayerReport(
			repository({ review: async () => ({ outcome: "conflict" }) }),
		);
		const value = {
			id: receipt.id,
			adminUserId: "admin",
			status: "investigating" as const,
			note: "Reviewed the match context",
			expectedRevision: 1,
			now,
		};
		await expect(review.run({ ...value, note: "  " })).rejects.toThrow(InvalidArgumentError);
		await expect(review.run({ ...value, note: "😀😀" })).rejects.toThrow(InvalidArgumentError);
		await expect(review.run({ ...value, note: "😀".repeat(2001) })).rejects.toThrow(
			InvalidArgumentError,
		);
		await expect(review.run({ ...value, note: "😀😀😀" })).rejects.toThrow(ConflictError);
		await expect(review.run(value)).rejects.toThrow(ConflictError);
	});
});
