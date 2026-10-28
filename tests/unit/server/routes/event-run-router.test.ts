import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { eventRunsRouter, eventsRouter } from "../../../../src/server/routes/event-run-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";

// Transport contract: every operation requires a bearer token (banGuard answers 401
// before any handler or database access).
const app = new Elysia().onError(mapDomainErrorStatus).use(eventsRouter).use(eventRunsRouter);

describe("event run router — transport", () => {
	const cases: Array<[string, string, string?]> = [
		["GET", "/events/halloween-2026"],
		["POST", "/events/halloween-2026/runs", JSON.stringify({ deckId: "necromancer" })],
		["GET", "/event-runs/me?eventId=halloween-2026"],
		["POST", "/event-runs/8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b/duel"],
	];

	for (const [method, path, body] of cases) {
		it(`${method} ${path} responds 401 without a bearer token`, async () => {
			const response = await app.handle(
				new Request(`http://localhost${path}`, {
					method,
					body,
					headers: body ? { "content-type": "application/json" } : undefined,
				}),
			);

			expect(response.status).toBe(401);
		});
	}
});

describe("event run router — domain error mapping", () => {
	it("maps ConflictError (live duel) to 409 and UnprocessableError (no attempts) to 422", async () => {
		const { ConflictError } = await import("../../../../src/shared/errors/ConflictError");
		const { UnprocessableError } = await import("../../../../src/shared/errors/UnprocessableError");
		const probe = new Elysia()
			.onError(mapDomainErrorStatus)
			.get("/live", () => {
				throw new ConflictError("A duel is in progress for this run");
			})
			.get("/attempts", () => {
				throw new UnprocessableError("No attempts left today");
			});

		const live = await probe.handle(new Request("http://localhost/live"));
		const attempts = await probe.handle(new Request("http://localhost/attempts"));

		expect(live.status).toBe(409);
		expect(await attempts.text()).toBe("No attempts left today");
		expect(attempts.status).toBe(422);
	});
});
