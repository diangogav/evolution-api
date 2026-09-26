import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { Elysia, t } from "elysia";

import {
	ErrorSchema,
	ValidationErrorSchema,
	emptyOk,
	errorResponses,
	jsonOk,
} from "../../../../src/server/openapi/responses";

describe("OpenAPI response helpers", () => {
	it("jsonOk declares an application/json body with the given schema", () => {
		const schema = t.Object({ id: t.String() });

		expect(jsonOk(schema, "User found")).toEqual({
			description: "User found",
			content: { "application/json": { schema } },
		});
	});

	it("jsonOk attaches an example to the media type when given", () => {
		const schema = t.Object({ id: t.String() });

		expect(jsonOk(schema, "User found", { id: "1" }).content).toEqual({
			"application/json": { schema, example: { id: "1" } },
		});
	});

	it("emptyOk declares a success without a body", () => {
		expect(emptyOk("Password changed")).toEqual({ description: "Password changed" });
	});

	it("errorResponses documents mapped errors as plain-text messages", () => {
		const responses = errorResponses(400, 401, 403, 404, 409);

		expect(Object.keys(responses).sort()).toEqual(["400", "401", "403", "404", "409"]);
		for (const response of Object.values(responses)) {
			expect(response.description.length).toBeGreaterThan(0);
			expect(response.content).toEqual({ "text/plain": { schema: ErrorSchema } });
		}
	});

	it("errorResponses documents 422 as the Elysia validation error JSON", () => {
		expect(errorResponses(422)[422].content).toEqual({
			"application/json": { schema: ValidationErrorSchema },
		});
	});

	it("ErrorSchema accepts the raw error message", () => {
		expect(Value.Check(ErrorSchema, "Username already taken")).toBe(true);
	});

	it("ValidationErrorSchema matches the body Elysia sends on a validation failure", async () => {
		const app = new Elysia().post("/probe", ({ body }) => body, {
			body: t.Object({ amount: t.Number() }),
		});
		const response = await app.handle(
			new Request("http://localhost/probe", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ amount: "ten" }),
			}),
		);

		expect(response.status).toBe(422);
		expect(response.headers.get("content-type")).toContain("application/json");
		expect(Value.Check(ValidationErrorSchema, await response.json())).toBe(true);
	});

	it("ValidationErrorSchema also accepts the reduced production body", () => {
		expect(Value.Check(ValidationErrorSchema, { type: "validation", on: "query", found: {} })).toBe(
			true,
		);
	});
});
