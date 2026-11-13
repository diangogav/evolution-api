import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { mapDomainErrorStatus, mountApiV1Routes } from "../../../src/server/server";

const buildApp = () => {
	const app = new Elysia().onError(mapDomainErrorStatus);
	mountApiV1Routes(app);

	return app;
};

const post = (app: Elysia, path: string, body: unknown) =>
	app.handle(
		new Request(`http://localhost/api/v1${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		}),
	);

// Elysia only awaits a handler it recognises as asynchronous: an async function, or one
// whose source matches this pattern. A handler outside both lets its rejection escape
// the error hook, and the client gets a 500 instead of the mapped status.
const recognisedAsAsync = /(?:return|=>)\s?\S+\(|a(?:sync|wait)/;

// Handlers that return a plain value and so have no rejection to lose.
const synchronousRoutes = ["GET /api/v1/push/public-key"];

describe("API route error mapping", () => {
	it.each([
		["/users/verify-email"],
		["/users/confirm-email-change"],
	])("answers 401 to an invalid token on %s", async (path) => {
		const response = await post(buildApp(), path, { token: "not-a-token" });

		expect(response.status).toBe(401);
	});

	it("mounts no handler whose rejection would escape the error hook", () => {
		const escaping = buildApp()
			.routes.filter(({ handler }) => typeof handler === "function")
			.filter(({ handler }) => {
				const fn = handler as (...args: unknown[]) => unknown;

				return fn.constructor.name !== "AsyncFunction" && !recognisedAsAsync.test(fn.toString());
			})
			.map(({ method, path }) => `${method} ${path}`)
			.filter((route) => !synchronousRoutes.includes(route));

		expect(escaping).toEqual([]);
	});
});
