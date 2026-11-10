import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import type { LightningChatMessageView } from "../../../../src/modules/lightning/domain/LightningChatPublisher";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import {
	createLightningRouter,
	type LightningRouterDependencies,
} from "../../../../src/server/routes/lightning-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { TooManyRequestsError } from "../../../../src/shared/errors/TooManyRequestsError";

const ID = "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";

function view(id: number): LightningChatMessageView {
	return {
		id,
		tournamentId: ID,
		author: { userId: "u-1", username: "Jaden", admin: false },
		body: `message ${id}`,
		createdAt: "2026-11-13T20:05:00.000Z",
	};
}

type Call = { useCase: string; input: unknown };

function buildApp() {
	const calls: Call[] = [];
	const record =
		<T>(useCase: string, answer: T | (() => T)) =>
		async (input: unknown) => {
			calls.push({ useCase, input });
			return typeof answer === "function" ? (answer as () => T)() : answer;
		};
	const unused = { run: async () => Promise.reject(new Error("not under test")) } as never;
	const answers = { post: (): unknown => view(7) };
	const deps: LightningRouterDependencies = {
		authorizer: {
			requireAdmin: (token) => {
				if (!token) throw new AuthenticationError("missing");
				if (token !== "admin-token") throw new ForbiddenError("admin required");
				return { userId: "admin-1" };
			},
			isAdmin: (token) => token === "admin-token",
		},
		requireUser: createRequireUser({
			jwt: { decode: (token) => ({ id: token }) },
			activeBans: { execute: async (userId) => (userId === "banned" ? { userId } : null) },
		}),
		clock: () => new Date("2026-11-13T20:10:00.000Z"),
		defaultSeason: 7,
		list: unused,
		get: unused,
		rankings: unused,
		enter: unused,
		withdraw: unused,
		pause: unused,
		resume: unused,
		myState: unused,
		myActive: unused,
		create: unused,
		cancel: unused,
		chatHistory: { run: record("history", [view(1), { id: 2, deleted: true }]) as never },
		chatPost: { run: record("post", () => answers.post()) as never },
		chatDelete: { run: record("delete", undefined) as never },
	};
	const app = new Elysia().onError(mapDomainErrorStatus).use(createLightningRouter(deps));
	return { app, calls, answers };
}

function send(method: string, path: string, token?: string, options: { body?: unknown } = {}) {
	const headers: Record<string, string> = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (options.body !== undefined) headers["content-type"] = "application/json";
	return new Request(`http://localhost/lightning${path}`, {
		method,
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
}

describe("lightning chat — history", () => {
	it("answers 401 without a token and 403 for a banned player", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("GET", `/${ID}/chat`))).status).toBe(401);
		expect((await app.handle(send("GET", `/${ID}/chat`, "banned"))).status).toBe(403);
		expect(calls).toEqual([]);
	});

	it("reads the newest page by default and pages back with before and limit", async () => {
		const { app, calls } = buildApp();

		const newest = await app.handle(send("GET", `/${ID}/chat`, "u-2"));
		const older = await app.handle(send("GET", `/${ID}/chat?before=40&limit=10`, "u-2"));

		expect(newest.status).toBe(200);
		expect(await newest.json()).toEqual([view(1), { id: 2, deleted: true }]);
		expect(older.status).toBe(200);
		expect(calls).toEqual([
			{ useCase: "history", input: { tournamentId: ID, before: null, limit: 50 } },
			{ useCase: "history", input: { tournamentId: ID, before: 40, limit: 10 } },
		]);
	});

	it("rejects a limit above the page size and a non-positive cursor", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("GET", `/${ID}/chat?limit=51`, "u-2"))).status).toBe(422);
		expect((await app.handle(send("GET", `/${ID}/chat?limit=0`, "u-2"))).status).toBe(422);
		expect((await app.handle(send("GET", `/${ID}/chat?before=0`, "u-2"))).status).toBe(422);
		expect(calls).toEqual([]);
	});
});

describe("lightning chat — post", () => {
	it("answers 201 with the message and tells the use case whether the caller is an admin", async () => {
		const { app, calls } = buildApp();

		const player = await app.handle(send("POST", `/${ID}/chat`, "u-1", { body: { body: "gl" } }));
		const admin = await app.handle(
			send("POST", `/${ID}/chat`, "admin-token", { body: { body: "welcome" } }),
		);

		expect(player.status).toBe(201);
		expect(await player.json()).toEqual(view(7));
		expect(admin.status).toBe(201);
		expect(calls).toEqual([
			{ useCase: "post", input: { tournamentId: ID, userId: "u-1", isAdmin: false, body: "gl" } },
			{
				useCase: "post",
				input: { tournamentId: ID, userId: "admin-token", isAdmin: true, body: "welcome" },
			},
		]);
	});

	it("rejects a missing or oversized body before the use case", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("POST", `/${ID}/chat`, "u-1", { body: {} }))).status).toBe(422);
		const long = { body: { body: "x".repeat(201) } };
		expect((await app.handle(send("POST", `/${ID}/chat`, "u-1", long))).status).toBe(422);
		expect(calls).toEqual([]);
	});

	it("maps the use case's rate limit and entrant check to 429 and 403", async () => {
		const { app, answers } = buildApp();
		const post = () => app.handle(send("POST", `/${ID}/chat`, "u-1", { body: { body: "hi" } }));

		answers.post = () => {
			throw new TooManyRequestsError("slow down");
		};
		expect((await post()).status).toBe(429);
		answers.post = () => {
			throw new ForbiddenError("Only entrants can write in the tournament chat");
		};
		expect((await post()).status).toBe(403);
	});
});

describe("lightning chat — admin delete", () => {
	it("answers 403 for a player and 204 for an admin, passing the message id as a number", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("DELETE", `/${ID}/chat/12`, "u-1"))).status).toBe(403);
		const deleted = await app.handle(send("DELETE", `/${ID}/chat/12`, "admin-token"));

		expect(deleted.status).toBe(204);
		expect(await deleted.text()).toBe("");
		expect(calls).toEqual([
			{ useCase: "delete", input: { tournamentId: ID, messageId: 12, adminUserId: "admin-1" } },
		]);
	});

	it("rejects a message id that is not a positive integer", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("DELETE", `/${ID}/chat/abc`, "admin-token"))).status).toBe(422);
		expect(calls).toEqual([]);
	});
});
