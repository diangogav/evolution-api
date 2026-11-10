import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { mapDomainErrorStatus } from "../../../src/server/server";
import { TooManyRequestsError } from "../../../src/shared/errors/TooManyRequestsError";

describe("mapDomainErrorStatus", () => {
	it("maps TooManyRequestsError to 429 with the message as plain text", async () => {
		const probe = new Elysia().onError(mapDomainErrorStatus).get("/probe", () => {
			throw new TooManyRequestsError("Slow down");
		});

		const response = await probe.handle(new Request("http://localhost/probe"));

		expect(response.status).toBe(429);
		expect(await response.text()).toBe("Slow down");
	});
});
