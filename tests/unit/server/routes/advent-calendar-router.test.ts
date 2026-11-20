import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { adventCalendarsRouter } from "../../../../src/server/routes/advent-calendar-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";

// Transport contract: every operation requires a bearer token (requireUser answers 401
// before any handler or database access).
const app = new Elysia().onError(mapDomainErrorStatus).use(adventCalendarsRouter);

describe("advent calendar router — transport", () => {
	const cases: Array<[string, string, string?]> = [
		["GET", "/advent-calendars/advent-2026"],
		["POST", "/advent-calendars/advent-2026/doors/5/duel", JSON.stringify({ deckId: "chaos" })],
		["POST", "/advent-calendars/advent-2026/doors/5/roll"],
		["POST", "/advent-calendars/advent-2026/doors/5/recover"],
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
