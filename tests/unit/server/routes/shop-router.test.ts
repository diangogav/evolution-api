import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { essenceRouter, shopRouter } from "../../../../src/server/routes/shop-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { PaymentRequiredError } from "../../../../src/shared/errors/PaymentRequiredError";

const app = new Elysia().onError(mapDomainErrorStatus).use(essenceRouter).use(shopRouter);

describe("essence and shop routers — transport", () => {
	it.each([
		["GET", "http://localhost/me/essence"],
		["GET", "http://localhost/shop"],
		["POST", "http://localhost/shop/sleeve-1/purchase"],
	])("%s %s responds 401 without a bearer token", async (method, url) => {
		const response = await app.handle(new Request(url, { method }));

		expect(response.status).toBe(401);
	});

	it("maps PaymentRequiredError to 402 with the message as plain text", async () => {
		const probe = new Elysia().onError(mapDomainErrorStatus).get("/probe", () => {
			throw new PaymentRequiredError("Insufficient essence");
		});

		const response = await probe.handle(new Request("http://localhost/probe"));

		expect(response.status).toBe(402);
		expect(await response.text()).toBe("Insufficient essence");
	});
});
