import { beforeAll, describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { Elysia, type TSchema } from "elysia";

import { mountApiV1Routes } from "../../../../src/server/server";
import { createSwagger } from "../../../../src/server/swagger";

type Operation = {
	tags?: string[];
	summary?: string;
	security?: Record<string, string[]>[];
	responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
};

type OpenApiDocument = {
	info: { title: string; version: string; description?: string };
	servers?: { url: string }[];
	tags?: { name: string; description?: string }[];
	"x-tagGroups"?: { name: string; tags: string[] }[];
	paths: Record<string, Record<string, Operation>>;
};

// Operations that require `Authorization: Bearer <token>`: their handler (or a
// guard in front of it) reads the caller's token. Adding a protected route
// requires adding it here, and the document must mark exactly these with
// bearerAuth. `reset-account-password` reads the reset-link token from the same
// header, so it is listed too.
const PROTECTED_OPERATIONS = [
	"POST /api/v1/users/reset-account-password",
	"POST /api/v1/users/change-username",
	"POST /api/v1/users/game-password",
	"POST /api/v1/users/upgrade-password",
	"POST /api/v1/users/change-account-password",
	"POST /api/v1/users/{userId}/ban",
	"POST /api/v1/users/{userId}/unban",
	"GET /api/v1/users/{userId}/ban/active",
	"GET /api/v1/users/{userId}/ban/history",
	"POST /api/v1/tournaments/",
	"POST /api/v1/tournaments/{tournamentId}/enroll",
	"POST /api/v1/tournaments/{tournamentId}/withdraw",
	"POST /api/v1/tournaments/{tournamentId}/bracket",
	"POST /api/v1/tournaments/{tournamentId}/matches/{matchId}/result",
	"DELETE /api/v1/tournaments/{tournamentId}/matches/{matchId}/result",
	"POST /api/v1/game-tickets/",
	"GET /api/v1/me/cosmetics/",
	"GET /api/v1/me/cosmetics/{id}/assets",
	"GET /api/v1/me/loadout/",
	"PUT /api/v1/me/loadout/",
	"GET /api/v1/admin/cosmetics/",
	"POST /api/v1/admin/cosmetics/",
	"POST /api/v1/admin/cosmetics/{id}/grants",
	"POST /api/v1/admin/matches/annulments",
	"POST /api/v1/admin/matches/annulments/reversals",
];

// Operations whose success has no body; they declare it with `emptyOk`.
const EMPTY_BODY_OPERATIONS = [
	"POST /api/v1/users/change-username",
	"POST /api/v1/users/change-account-password",
];

// Operations that still lack a 2xx application/json schema. This list only
// shrinks: documenting an operation's response requires removing it here.
const PENDING_RESPONSE_SCHEMAS = [
	"POST /api/v1/users/{userId}/ban",
	"POST /api/v1/users/{userId}/unban",
	"GET /api/v1/users/{userId}/ban/active",
	"GET /api/v1/users/{userId}/ban/history",
	"GET /api/v1/tournaments/",
	"POST /api/v1/tournaments/",
	"POST /api/v1/tournaments/webhook",
	"GET /api/v1/tournaments/ranking",
	"POST /api/v1/tournaments/{tournamentId}/enroll",
	"POST /api/v1/tournaments/{tournamentId}/withdraw",
	"GET /api/v1/tournaments/{tournamentId}/bracket",
	"POST /api/v1/tournaments/{tournamentId}/bracket",
	"POST /api/v1/tournaments/{tournamentId}/matches/{matchId}/result",
	"DELETE /api/v1/tournaments/{tournamentId}/matches/{matchId}/result",
	"GET /api/v1/tournaments/{tournamentId}/entries",
	"GET /api/v1/cosmetics/",
	"GET /api/v1/cosmetics/{id}/assets",
	"GET /api/v1/me/cosmetics/",
	"GET /api/v1/me/cosmetics/{id}/assets",
	"GET /api/v1/me/loadout/",
	"PUT /api/v1/me/loadout/",
	"GET /api/v1/users/by-username/{username}/loadout",
	"GET /api/v1/admin/cosmetics/",
	"POST /api/v1/admin/cosmetics/",
	"POST /api/v1/admin/cosmetics/{id}/grants",
	"POST /api/v1/admin/matches/annulments",
	"POST /api/v1/admin/matches/annulments/reversals",
];

const successResponses = (operation: Operation) =>
	Object.entries(operation.responses ?? {})
		.filter(([status]) => status.startsWith("2"))
		.map(([, response]) => response);

const hasJsonSuccessSchema = (operation: Operation) =>
	successResponses(operation).some(
		(response) => response.content?.["application/json"]?.schema !== undefined,
	);

const hasEmptySuccess = (operation: Operation) =>
	successResponses(operation).some((response) => response.content === undefined);

type DocumentedRoute = {
	method: string;
	path: string;
	hooks: {
		detail?: {
			responses?: Record<
				string,
				{ content?: Record<string, { schema?: TSchema; example?: unknown }> }
			>;
		};
	};
};

describe("OpenAPI document", () => {
	let document: OpenApiDocument;
	let operations: { key: string; operation: Operation }[];
	let routes: DocumentedRoute[];

	beforeAll(async () => {
		const app = mountApiV1Routes(new Elysia().use(createSwagger())) as unknown as Elysia;
		routes = app.routes as unknown as DocumentedRoute[];
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

	it("declares bearerAuth on exactly the protected operations", () => {
		const secured = operations
			.filter(({ operation }) =>
				operation.security?.some((requirement) => "bearerAuth" in requirement),
			)
			.map(({ key }) => key);
		expect([...secured].sort()).toEqual([...PROTECTED_OPERATIONS].sort());
	});

	it("publishes the package version and the production and local servers", () => {
		expect(document.info.version).toMatch(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/);
		expect((document.servers ?? []).map((server) => server.url)).toEqual([
			"https://api.evolutionygo.com",
			"http://localhost:3000",
		]);
	});

	it("declares a success response schema on every operation not pending one", () => {
		const exempt = new Set([...EMPTY_BODY_OPERATIONS, ...PENDING_RESPONSE_SCHEMAS]);
		const undocumented = operations
			.filter(({ key, operation }) => !exempt.has(key) && !hasJsonSuccessSchema(operation))
			.map(({ key }) => key);
		expect(undocumented).toEqual([]);
	});

	it("declares empty-body successes without content", () => {
		const byKey = new Map(operations.map(({ key, operation }) => [key, operation]));
		const invalid = EMPTY_BODY_OPERATIONS.filter((key) => {
			const operation = byKey.get(key);
			return operation === undefined || !hasEmptySuccess(operation);
		});
		expect(invalid).toEqual([]);
	});

	it("keeps the pending allowlist limited to existing operations still without a schema", () => {
		const byKey = new Map(operations.map(({ key, operation }) => [key, operation]));
		const stale = PENDING_RESPONSE_SCHEMAS.filter((key) => {
			const operation = byKey.get(key);
			return operation === undefined || hasJsonSuccessSchema(operation);
		});
		expect(stale).toEqual([]);
		expect(PENDING_RESPONSE_SCHEMAS.filter((key) => EMPTY_BODY_OPERATIONS.includes(key))).toEqual(
			[],
		);
	});

	// The published document loses TypeBox's Kind symbols, so the check runs on the
	// schema objects the routes declare, which the document is generated from.
	it("gives every documented success example a shape its schema accepts", () => {
		const examples = routes.flatMap(({ method, path, hooks }) =>
			Object.entries(hooks.detail?.responses ?? {})
				.filter(([status]) => status.startsWith("2"))
				.map(([status, response]) => ({
					key: `${method} ${path} ${status}`,
					media: response.content?.["application/json"],
				}))
				.filter(({ media }) => media?.schema !== undefined && media.example !== undefined),
		);
		const invalid = examples
			.filter(({ media }) => !Value.Check(media?.schema as TSchema, media?.example))
			.map(({ key }) => key);

		expect(examples.length).toBeGreaterThan(0);
		expect(invalid).toEqual([]);
	});

	it("groups every declared tag exactly once", () => {
		const declared = (document.tags ?? []).map((tag) => tag.name);
		const grouped = (document["x-tagGroups"] ?? []).flatMap((group) => group.tags);
		expect(grouped.length).toBe(new Set(grouped).size);
		expect([...grouped].sort()).toEqual([...declared].sort());
	});
});
