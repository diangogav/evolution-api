import { beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { mountApiV1Routes } from "../../../../src/server/server";
import { createSwagger } from "../../../../src/server/swagger";

type Operation = {
	tags?: string[];
	summary?: string;
	security?: Record<string, string[]>[];
};

type OpenApiDocument = {
	info: { title: string; description?: string };
	tags?: { name: string; description?: string }[];
	"x-tagGroups"?: { name: string; tags: string[] }[];
	paths: Record<string, Record<string, Operation>>;
};

type RegisteredRoute = { method: string; path: string; handler: unknown };

// Convention: a route is protected when its handler reads the caller's token,
// either through the `bearer` context value derived by @elysiajs/bearer or
// through the raw Authorization header. Every such route must advertise the
// bearerAuth security scheme so the reference shows which calls need a token.
const READS_TOKEN = /\bbearer\b|authorization/i;

const toOpenApiPath = (path: string) => path.replace(/:(\w+)/g, "{$1}");

describe("OpenAPI document", () => {
	let app: Elysia;
	let document: OpenApiDocument;
	let operations: { key: string; operation: Operation }[];

	beforeAll(async () => {
		app = mountApiV1Routes(new Elysia().use(createSwagger())) as unknown as Elysia;
		const response = await app.handle(new Request("http://localhost/swagger/json"));
		document = (await response.json()) as OpenApiDocument;
		operations = Object.entries(document.paths).flatMap(([path, methods]) =>
			Object.entries(methods).map(([method, operation]) => ({
				key: `${method.toUpperCase()} ${path}`,
				operation,
			})),
		);
	});

	it("documents the routes mounted under /api/v1", () => {
		expect(operations.length).toBeGreaterThan(30);
		expect(operations.every(({ key }) => key.includes(" /api/v1/"))).toBe(true);
	});

	it("describes the whole platform instead of only tournaments", () => {
		expect(document.info.title).toBe("Evolution API");
		expect(document.info.title).not.toMatch(/tournament/i);
	});

	it("gives every operation at least one tag", () => {
		const untagged = operations
			.filter(({ operation }) => (operation.tags ?? []).length === 0)
			.map(({ key }) => key);
		expect(untagged).toEqual([]);
	});

	it("declares exactly the tags the operations use", () => {
		const used = new Set(operations.flatMap(({ operation }) => operation.tags ?? []));
		const declared = (document.tags ?? []).map((tag) => tag.name);
		expect([...declared].sort()).toEqual([...used].sort());
		expect((document.tags ?? []).every((tag) => (tag.description ?? "").length > 0)).toBe(true);
	});

	it("gives every operation a summary", () => {
		const withoutSummary = operations
			.filter(({ operation }) => (operation.summary ?? "").trim().length === 0)
			.map(({ key }) => key);
		expect(withoutSummary).toEqual([]);
	});

	it("declares bearerAuth on every operation whose handler reads the token", () => {
		const routes = (app as unknown as { routes: RegisteredRoute[] }).routes;
		const protectedKeys = routes
			.filter((route) => READS_TOKEN.test(String(route.handler)))
			.map((route) => `${route.method} ${toOpenApiPath(route.path)}`);

		expect(protectedKeys.length).toBeGreaterThan(10);

		const byKey = new Map(operations.map(({ key, operation }) => [key, operation]));
		const missingSecurity = protectedKeys.filter(
			(key) => !byKey.get(key)?.security?.some((requirement) => "bearerAuth" in requirement),
		);
		expect(missingSecurity).toEqual([]);
	});

	it("groups every declared tag exactly once", () => {
		const declared = (document.tags ?? []).map((tag) => tag.name);
		const grouped = (document["x-tagGroups"] ?? []).flatMap((group) => group.tags);
		expect(grouped.length).toBe(new Set(grouped).size);
		expect([...grouped].sort()).toEqual([...declared].sort());
	});
});
