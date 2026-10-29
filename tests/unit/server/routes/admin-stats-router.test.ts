import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import type {
	GetActivityStats,
	GetActivityStatsInput,
	GetActivityStatsResult,
} from "../../../../src/modules/activity-stats/application/GetActivityStats";
import { createAdminStatsRouter } from "../../../../src/server/routes/admin-stats-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";

const RESULT: GetActivityStatsResult = {
	period: "week",
	from: "2026-10-26T00:00:00.000Z",
	to: "2026-11-02T00:00:00.000Z",
	buckets: [
		{
			start: "2026-10-26T00:00:00.000Z",
			newUsers: 1,
			activePlayers: 2,
			rankedMatches: 3,
			unrankedMatches: 4,
			evoduelRankedMatches: 1,
			evoduelUnrankedMatches: 2,
		},
	],
	byBanList: [],
};

const NOW = new Date("2026-10-29T12:00:00.000Z");

function buildApp() {
	const calls: GetActivityStatsInput[] = [];
	const getActivityStats = {
		run: async (input: GetActivityStatsInput) => {
			calls.push(input);
			return RESULT;
		},
	} as unknown as GetActivityStats;
	const app = new Elysia().onError(mapDomainErrorStatus).use(
		createAdminStatsRouter({
			authorizer: {
				requireAdmin: (token) => {
					if (!token) throw new AuthenticationError("missing");
					if (token !== "admin-token") throw new ForbiddenError("admin required");
					return { userId: "admin-1" };
				},
			},
			getActivityStats,
			clock: () => NOW,
		}),
	);
	return { app, calls };
}

function get(query: string, token?: string) {
	return new Request(`http://localhost/admin/stats/activity${query}`, {
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});
}

describe("admin activity stats route", () => {
	it("answers 401 without a token and 403 for a non-admin", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(get("?period=day"))).status).toBe(401);
		expect((await app.handle(get("?period=day", "user-token"))).status).toBe(403);
		expect(calls).toHaveLength(0);
	});

	it("answers the report to an admin, passing period, bucket count and the clock", async () => {
		const { app, calls } = buildApp();

		const response = await app.handle(get("?period=week&buckets=4", "admin-token"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(RESULT);
		expect(calls).toEqual([{ period: "week", buckets: 4, now: NOW }]);
	});

	it("leaves the bucket count to the use case default when omitted", async () => {
		const { app, calls } = buildApp();

		const response = await app.handle(get("?period=month", "admin-token"));

		expect(response.status).toBe(200);
		expect(calls).toEqual([{ period: "month", buckets: undefined, now: NOW }]);
	});

	it("rejects a missing or unknown period and a non-integer bucket count", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(get("", "admin-token"))).status).toBe(422);
		expect((await app.handle(get("?period=year", "admin-token"))).status).toBe(422);
		expect((await app.handle(get("?period=day&buckets=abc", "admin-token"))).status).toBe(422);
		expect((await app.handle(get("?period=day&buckets=0", "admin-token"))).status).toBe(422);
		expect(calls).toHaveLength(0);
	});
});
