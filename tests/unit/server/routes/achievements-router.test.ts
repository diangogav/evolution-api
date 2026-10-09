import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { GetAchievementCatalog } from "../../../../src/modules/achievements/application/GetAchievementCatalog";
import { AchievementCatalogSchema } from "../../../../src/modules/achievements/infrastructure/AchievementsSchemas";
import { createAchievementsRouter } from "../../../../src/server/routes/achievements-router";

const router = createAchievementsRouter({
	getCatalog: new GetAchievementCatalog({
		findGameplay: async () => [
			{
				id: 1001,
				code: "first_win",
				icon: "sword",
				name: "First Blood",
				description: "Win your first ranked match",
				earnedPoints: 0,
				updatedAt: new Date("2026-10-09T00:00:00.000Z"),
			},
		],
	}),
});

const get = (headers: Record<string, string> = {}) =>
	router.handle(new Request("http://localhost/achievements", { headers }));

describe("GET /achievements", () => {
	it("serves the catalog without credentials, with an ETag equal to the version", async () => {
		const response = await get();
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(Value.Check(AchievementCatalogSchema, body)).toBe(true);
		expect(body.items[0].requirement).toEqual({ metric: "rankedWins", target: 1 });
		expect(response.headers.get("etag")).toBe(`"${body.version}"`);
	});

	it("answers 304 with no body when If-None-Match carries the current version", async () => {
		const { version } = await (await get()).json();
		const response = await get({ "if-none-match": `"${version}"` });

		expect(response.status).toBe(304);
		expect(await response.text()).toBe("");
		expect(response.headers.get("etag")).toBe(`"${version}"`);
	});

	it("answers 200 when If-None-Match is stale", async () => {
		const response = await get({ "if-none-match": '"stale"' });

		expect(response.status).toBe(200);
	});
});
