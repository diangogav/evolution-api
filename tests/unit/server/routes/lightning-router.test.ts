import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import {
	createLightningRouter,
	type LightningRouterDependencies,
} from "../../../../src/server/routes/lightning-router";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ConflictError } from "../../../../src/shared/errors/ConflictError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { UnprocessableError } from "../../../../src/shared/errors/UnprocessableError";

const NOW = new Date("2026-11-10T20:10:00.000Z");
const ID = "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";
const DECK = { main: [1, 2, 3], extra: [4], side: [] };

type Call = { useCase: string; input: unknown };

function buildApp() {
	const calls: Call[] = [];
	const record =
		<T>(useCase: string, answer: T | (() => T)) =>
		async (input: unknown) => {
			calls.push({ useCase, input });
			return typeof answer === "function" ? (answer as () => T)() : answer;
		};
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
			jwt: {
				decode: (token) => {
					if (token === "bad") throw new Error("invalid");
					return { id: token };
				},
			},
			activeBans: { execute: async (userId) => (userId === "banned" ? { userId } : null) },
		}),
		clock: () => NOW,
		defaultSeason: 7,
		list: { run: record("list", []) as never },
		get: { run: record("get", { id: ID }) as never },
		rankings: { run: record("rankings", []) as never },
		enter: {
			run: record("enter", () => {
				throw new ConflictError("You are already entered in this tournament");
			}) as never,
		},
		withdraw: { run: record("withdraw", { userId: "u-1" }) as never },
		pause: { run: record("pause", { userId: "u-1" }) as never },
		resume: { run: record("resume", { userId: "u-1" }) as never },
		myState: { run: record("myState", { entry: null }) as never },
		myActive: { run: record("myActive", []) as never },
		create: {
			run: record("create", () => {
				throw new UnprocessableError("Invalid lightning tournament: name");
			}) as never,
		},
		cancel: { run: record("cancel", { id: ID, status: "cancelled" }) as never },
		chatHistory: { run: record("chatHistory", []) as never },
		chatPost: { run: record("chatPost", {}) as never },
		chatDelete: { run: record("chatDelete", undefined) as never },
		chatStream: { open: record("chatStream", new Response("")) as never },
	};
	const app = new Elysia().onError(mapDomainErrorStatus).use(createLightningRouter(deps));
	return { app, calls };
}

function send(method: string, path: string, token?: string, body?: unknown) {
	const headers: Record<string, string> = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined) headers["content-type"] = "application/json";
	return new Request(`http://localhost/lightning${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

describe("lightning router — public reads", () => {
	it("lists, details and ranks without a token, passing the clock and the default season", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("GET", "/"))).status).toBe(200);
		expect((await app.handle(send("GET", "/?status=completed"))).status).toBe(200);
		expect((await app.handle(send("GET", `/${ID}`))).status).toBe(200);
		expect((await app.handle(send("GET", "/rankings"))).status).toBe(200);
		expect((await app.handle(send("GET", "/rankings?season=6&limit=10"))).status).toBe(200);

		expect(calls).toEqual([
			{ useCase: "list", input: {} },
			{ useCase: "list", input: { status: "completed" } },
			{ useCase: "get", input: { tournamentId: ID, now: NOW } },
			{ useCase: "rankings", input: { season: 7, limit: 50 } },
			{ useCase: "rankings", input: { season: 6, limit: 10 } },
		]);
	});

	it("rejects an unknown status filter", async () => {
		const { app } = buildApp();

		expect((await app.handle(send("GET", "/?status=bracket"))).status).toBe(422);
	});
});

describe("lightning router — player routes", () => {
	const routes: Array<[string, string, unknown?]> = [
		["POST", `/${ID}/entries`, { deck: DECK }],
		["DELETE", `/${ID}/entries/me`],
		["POST", `/${ID}/entries/me/pause`],
		["POST", `/${ID}/entries/me/resume`],
		["GET", `/${ID}/me`],
		["GET", "/me/active"],
	];

	it("answer 401 without a token and 403 for a banned player, before any use case", async () => {
		const { app, calls } = buildApp();

		for (const [method, path, body] of routes) {
			expect((await app.handle(send(method, path, undefined, body))).status).toBe(401);
			expect((await app.handle(send(method, path, "banned", body))).status).toBe(403);
		}
		expect(calls).toEqual([]);
	});

	it("hand the token's user to the use cases", async () => {
		const { app, calls } = buildApp();

		for (const [method, path, body] of routes.slice(1)) {
			expect((await app.handle(send(method, path, "u-1", body))).status).toBe(200);
		}

		const input = { tournamentId: ID, userId: "u-1", now: NOW };
		expect(calls).toEqual([
			{ useCase: "withdraw", input },
			{ useCase: "pause", input },
			{ useCase: "resume", input },
			{ useCase: "myState", input },
			{ useCase: "myActive", input: { userId: "u-1" } },
		]);
	});

	it("routes /me/active to the active entries, apart from the tournament and its /me", async () => {
		const { app, calls } = buildApp();

		const active = await app.handle(send("GET", "/me/active", "u-1"));
		expect((await app.handle(send("GET", `/${ID}/me`, "u-1"))).status).toBe(200);
		expect((await app.handle(send("GET", "/me", "u-1"))).status).toBe(200);

		expect(active.status).toBe(200);
		expect(await active.json()).toEqual([]);
		expect(calls).toEqual([
			{ useCase: "myActive", input: { userId: "u-1" } },
			{ useCase: "myState", input: { tournamentId: ID, userId: "u-1", now: NOW } },
			{ useCase: "get", input: { tournamentId: "me", now: NOW } },
		]);
	});

	it("validates the deck and maps an existing entry to 409", async () => {
		const { app, calls } = buildApp();

		const invalid = await app.handle(
			send("POST", `/${ID}/entries`, "u-1", { deck: { main: ["x"] } }),
		);
		const entered = await app.handle(send("POST", `/${ID}/entries`, "u-1", { deck: DECK }));

		expect(invalid.status).toBe(422);
		expect(entered.status).toBe(409);
		expect(calls).toEqual([
			{ useCase: "enter", input: { tournamentId: ID, userId: "u-1", deck: DECK, now: NOW } },
		]);
	});
});

describe("lightning router — admin routes", () => {
	const body = {
		name: "Friday Lightning",
		format: "tcg",
		registrationOpensAt: "2026-11-10T19:00:00.000Z",
		startsAt: "2026-11-10T20:00:00.000Z",
		endsAt: "2026-11-10T21:00:00.000Z",
	};

	it("answer 401 without a token and 403 for a non-admin", async () => {
		const { app, calls } = buildApp();

		for (const [path, payload] of [
			["/", body],
			[`/${ID}/cancel`, { reason: "Maintenance" }],
		] as const) {
			expect((await app.handle(send("POST", path, undefined, payload))).status).toBe(401);
			expect((await app.handle(send("POST", path, "u-1", payload))).status).toBe(403);
		}
		expect(calls).toEqual([]);
	});

	it("creates with the admin as author and the default season, and maps rule failures to 422", async () => {
		const { app, calls } = buildApp();

		const response = await app.handle(
			send("POST", "/", "admin-token", { ...body, turnTimeSeconds: 120 }),
		);

		expect(response.status).toBe(422);
		expect(calls).toEqual([
			{
				useCase: "create",
				input: {
					name: "Friday Lightning",
					format: "tcg",
					season: 7,
					registrationOpensAt: new Date(body.registrationOpensAt),
					startsAt: new Date(body.startsAt),
					endsAt: new Date(body.endsAt),
					turnTimeSeconds: 120,
					lobbyTimeoutSeconds: undefined,
					minPlayers: undefined,
					maxPlayers: undefined,
					pointsByPosition: undefined,
					essenceByPosition: undefined,
					createdBy: "admin-1",
					now: NOW,
				},
			},
		]);
	});

	it("passes the Swiss settings through and rejects them out of bounds before the use case", async () => {
		const { app, calls } = buildApp();
		const swiss = { ...body, system: "swiss", rounds: 4, roundMinutes: 30, roundBreakSeconds: 0 };

		await app.handle(send("POST", "/", "admin-token", swiss));
		const outOfBounds = await app.handle(
			send("POST", "/", "admin-token", { ...swiss, rounds: 10 }),
		);

		expect(outOfBounds.status).toBe(422);
		expect(calls).toHaveLength(1);
		expect(calls[0].input).toMatchObject({
			system: "swiss",
			rounds: 4,
			roundMinutes: 30,
			roundBreakSeconds: 0,
		});
	});

	it("cancels with the reason", async () => {
		const { app, calls } = buildApp();

		const response = await app.handle(
			send("POST", `/${ID}/cancel`, "admin-token", { reason: "Maintenance" }),
		);

		expect(response.status).toBe(200);
		expect(calls).toEqual([
			{ useCase: "cancel", input: { tournamentId: ID, reason: "Maintenance", now: NOW } },
		]);
	});
});
