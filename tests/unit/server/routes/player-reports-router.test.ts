import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import {
	createAdminPlayerReportsRouter,
	createPlayerReportsRouter,
} from "../../../../src/server/routes/player-reports-router";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { ConflictError } from "../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../src/shared/errors/NotFoundError";
import type {
	PlayerReport,
	SubmitReportInput,
	ReviewReportInput,
} from "../../../../src/modules/player-reports/domain/PlayerReport";

const id = "9044b99a-e5ed-4c4f-88f5-7141e462ea9a";
const date = "2026-10-31T12:00:00.000Z";
const receipt = { id, status: "open" as const, createdAt: date };
const report: PlayerReport = {
	...receipt,
	reporterId: "signed-user",
	reportedUserId: "opponent",
	gameId: "a0000000-0000-4000-8000-000000000001",
	reason: "stalling",
	details: "Opponent repeatedly stalled.",
	updatedAt: date,
	revision: 1,
	context: {
		matchId: "match",
		gameId: "a0000000-0000-4000-8000-000000000001",
		date,
		banListName: "TCG",
		bestOf: 3,
		playerScore: 1,
		opponentScore: 2,
		playerIds: ["signed-user"],
		opponentIds: ["opponent"],
		playerNames: ["Reporter"],
		opponentNames: ["Opponent"],
		reporterUsername: "Reporter",
		reportedUsername: "Opponent",
	},
};
function fixture() {
	const submissions: SubmitReportInput[] = [];
	const reviews: ReviewReportInput[] = [];
	let lists = 0;
	const requireUser = createRequireUser({
		jwt: {
			decode: (token) => {
				if (token === "user") return { id: "signed-user" };
				if (token === "banned") return { id: "banned-user" };
				throw new Error("bad signature");
			},
		},
		activeBans: { execute: async (userId) => (userId === "banned-user" ? { userId } : null) },
	});
	const app = new Elysia()
		.onError(({ error, set }) => {
			if (error instanceof AuthenticationError) set.status = 401;
			if (error instanceof ForbiddenError) set.status = 403;
			if (error instanceof ConflictError) set.status = 409;
			if (error instanceof NotFoundError) set.status = 404;
		})
		.use(
			createPlayerReportsRouter({
				requireUser,
				listMatches: {
					run: async (input) => {
						expect(input.reporterId).toBe("signed-user");
						lists++;
						return [];
					},
				},
				submit: {
					run: async (input) => {
						submissions.push(input);
						return receipt;
					},
				},
			}),
		)
		.use(
			createAdminPlayerReportsRouter({
				authorizer: {
					requireAdmin: (token) => {
						if (!token) throw new AuthenticationError("missing");
						if (token !== "admin") throw new ForbiddenError("admin required");
						return { userId: "signed-admin" };
					},
				},
				list: {
					run: async () => {
						lists++;
						return [];
					},
				},
				get: { run: async () => ({ ...report, reviews: [] }) },
				review: {
					run: async (input) => {
						reviews.push(input);
						return { ...report, status: input.status, revision: 2 };
					},
				},
			}),
		);
	const request = (path: string, token?: string, body?: unknown) =>
		app.handle(
			new Request("http://localhost" + path, {
				method: body === undefined ? "GET" : "POST",
				headers: {
					...(token ? { Authorization: "Bearer " + token } : {}),
					"Content-Type": "application/json",
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		);
	return {
		request,
		submissions,
		reviews,
		get lists() {
			return lists;
		},
	};
}
describe("Player report routes", () => {
	it("requires player auth for history and submission and admin auth for every moderation operation", async () => {
		const f = fixture();
		const body = {
			gameId: "a0000000-0000-4000-8000-000000000001",
			reportedUserId: "opponent",
			reason: "stalling",
			details: "Opponent repeatedly stalled.",
		};
		expect((await f.request("/me/player-reports/matches")).status).toBe(401);
		expect((await f.request("/me/player-reports/", undefined, body)).status).toBe(401);
		expect((await f.request("/me/player-reports/matches", "forged")).status).toBe(401);
		expect((await f.request("/me/player-reports/matches", "banned")).status).toBe(403);
		expect((await f.request("/me/player-reports/", "banned", body)).status).toBe(403);
		for (const token of [undefined, "user"]) {
			const status = token ? 403 : 401;
			expect((await f.request("/admin/player-reports/", token)).status).toBe(status);
			expect((await f.request("/admin/player-reports/" + id, token)).status).toBe(status);
			expect(
				(
					await f.request("/admin/player-reports/" + id + "/reviews", token, {
						status: "dismissed",
						note: "Reviewed evidence",
						expectedRevision: 1,
					})
				).status,
			).toBe(status);
		}
		expect(f.lists).toBe(0);
		expect(f.submissions).toHaveLength(0);
		expect(f.reviews).toHaveLength(0);
	});
	it("derives the reporter from the token and returns a bounded receipt", async () => {
		const f = fixture();
		const response = await f.request("/me/player-reports/", "user", {
			gameId: "a0000000-0000-4000-8000-000000000001",
			reportedUserId: "opponent",
			reason: "stalling",
			details: "Opponent repeatedly stalled.",
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(receipt);
		expect(f.submissions[0].reporterId).toBe("signed-user");
		expect(f.submissions[0].now).toBeInstanceOf(Date);
		expect((await f.request("/me/player-reports/matches?page=1&limit=20", "user")).status).toBe(
			200,
		);
	});
	it("rejects invalid reason, oversized details and unbounded pages before handlers", async () => {
		const f = fixture();
		const body = {
			gameId: "a0000000-0000-4000-8000-000000000001",
			reportedUserId: "opponent",
			reason: "ban",
			details: "Opponent repeatedly stalled.",
		};
		expect((await f.request("/me/player-reports/", "user", body)).status).toBe(422);
		expect(
			(
				await f.request("/me/player-reports/", "user", {
					...body,
					reason: "other",
					details: "x".repeat(2001),
				})
			).status,
		).toBe(422);
		expect((await f.request("/me/player-reports/matches?limit=1000", "user")).status).toBe(422);
		expect(f.submissions).toHaveLength(0);
		expect(f.lists).toBe(0);
	});
	it("validates Unicode code-point bounds for allegations and review notes", async () => {
		const f = fixture();
		for (const [count, status] of [
			[5, 422],
			[10, 200],
			[2000, 200],
			[2001, 422],
		]) {
			expect(
				(
					await f.request("/me/player-reports/", "user", {
						gameId: report.gameId,
						reportedUserId: "opponent",
						reason: "other",
						details: "😀".repeat(count),
					})
				).status,
			).toBe(status);
		}
		for (const [count, status] of [
			[2, 422],
			[3, 200],
			[2000, 200],
			[2001, 422],
		]) {
			expect(
				(
					await f.request("/admin/player-reports/" + id + "/reviews", "admin", {
						status: "investigating",
						expectedRevision: 1,
						note: "😀".repeat(count),
					})
				).status,
			).toBe(status);
		}
		expect(f.submissions).toHaveLength(2);
		expect(f.reviews).toHaveLength(2);
	});
	it("uses the authenticated administrator and requires a review revision", async () => {
		const f = fixture();
		const path = "/admin/player-reports/" + id + "/reviews";
		expect(
			(await f.request(path, "admin", { status: "investigating", note: "Checking logs" })).status,
		).toBe(422);
		const response = await f.request(path, "admin", {
			status: "investigating",
			note: "Checking logs",
			expectedRevision: 1,
		});
		expect(response.status).toBe(200);
		expect(f.reviews[0].adminUserId).toBe("signed-admin");
		expect(f.reviews[0].expectedRevision).toBe(1);
	});
});
