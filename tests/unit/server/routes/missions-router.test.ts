import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { missionsRouter } from "../../../../src/server/routes/missions-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";

// Transport contract: both operations require a bearer token; the period query is
// validated before any handler runs.
const app = new Elysia().onError(mapDomainErrorStatus).use(missionsRouter);

describe("missions router — transport", () => {
	it("GET /me/missions responds 401 without a bearer token", async () => {
		const response = await app.handle(new Request("http://localhost/me/missions?period=daily"));

		expect(response.status).toBe(401);
	});

	it("POST /me/missions/:code/claim responds 401 without a bearer token", async () => {
		const response = await app.handle(
			new Request("http://localhost/me/missions/play_3/claim", { method: "POST" }),
		);

		expect(response.status).toBe(401);
	});
});
