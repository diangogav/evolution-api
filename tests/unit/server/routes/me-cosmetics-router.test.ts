import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { meCosmeticsRouter } from "../../../../src/server/routes/me-cosmetics-router";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";

// Transport-level auth contract for GET /me/cosmetics. The 401 mapping for
// AuthenticationError lives in Server.onError (not in the router), so the test
// mounts the router under an Elysia app that mirrors that single mapping — the
// same shape server.ts wires in production. This proves an unauthenticated
// request is rejected, so no personalized catalog ever leaks on this route.
const app = new Elysia()
	.onError(({ error, set }) => {
		if (error instanceof AuthenticationError) set.status = 401;
	})
	.use(meCosmeticsRouter);

describe("GET /me/cosmetics — transport auth", () => {
	it("responds 401 when no bearer token is provided", async () => {
		const response = await app.handle(new Request("http://localhost/me/cosmetics"));

		expect(response.status).toBe(401);
	});

	it("responds 401 when the bearer token is invalid", async () => {
		const response = await app.handle(
			new Request("http://localhost/me/cosmetics", {
				headers: { Authorization: "Bearer not-a-valid-jwt" },
			}),
		);

		expect(response.status).toBe(401);
	});
});
