import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import type {
	GetEventStats,
	GetEventStatsInput,
	GetEventStatsResult,
} from "../../../../src/modules/event-stats/application/GetEventStats";
import type {
	ListAdminEvents,
	ListAdminEventsResult,
} from "../../../../src/modules/event-stats/application/ListAdminEvents";
import { createAdminEventsRouter } from "../../../../src/server/routes/admin-events-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { NotFoundError } from "../../../../src/shared/errors/NotFoundError";

const EVENT = {
	id: "halloween-2026",
	name: "Halloween",
	startsAt: "2026-10-28T00:00:00.000Z",
	endsAt: "2026-11-08T00:00:00.000Z",
	waves: 8,
};

const EVENTS: ListAdminEventsResult = [EVENT];

const STATS: GetEventStatsResult = {
	event: EVENT,
	totals: {
		players: 1,
		runs: 1,
		completedRuns: 0,
		inProgressRuns: 1,
		lostRuns: 0,
		expiredRuns: 0,
		supersededRuns: 0,
	},
	daily: [{ date: "2026-10-28", runs: 1, players: 1 }],
	waveFunnel: [{ wave: 1, runsCleared: 0 }],
	decks: [
		{
			deckId: "necromancer",
			deckName: "Necromancer",
			runs: 1,
			players: 1,
			completedRuns: 0,
			bestWavesCleared: 0,
			avgWavesCleared: 0,
		},
	],
	duels: { wins: 0, losses: 0, playerVoids: 0, other: 0 },
	players: [
		{
			userId: "user-1",
			username: "Chazz_666",
			runs: 1,
			bestWavesCleared: 0,
			deckIds: ["necromancer"],
			inProgress: true,
			lastActivityAt: "2026-10-28T10:00:00.000Z",
		},
	],
};

const NOW = new Date("2026-10-29T12:00:00.000Z");

function buildApp() {
	const statsCalls: GetEventStatsInput[] = [];
	let listCalls = 0;
	const listAdminEvents = {
		run: async () => {
			listCalls++;
			return EVENTS;
		},
	} as unknown as ListAdminEvents;
	const getEventStats = {
		run: async (input: GetEventStatsInput) => {
			statsCalls.push(input);
			if (input.eventId !== EVENT.id) throw new NotFoundError("event not found");
			return STATS;
		},
	} as unknown as GetEventStats;
	const app = new Elysia().onError(mapDomainErrorStatus).use(
		createAdminEventsRouter({
			authorizer: {
				requireAdmin: (token) => {
					if (!token) throw new AuthenticationError("missing");
					if (token !== "admin-token") throw new ForbiddenError("admin required");
					return { userId: "admin-1" };
				},
			},
			listAdminEvents,
			getEventStats,
			clock: () => NOW,
		}),
	);
	return { app, statsCalls, listCalls: () => listCalls };
}

function get(path: string, token?: string) {
	return new Request(`http://localhost/admin/events${path}`, {
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});
}

describe("admin events routes", () => {
	it("answers 401 without a token and 403 for a non-admin on both routes", async () => {
		const { app, statsCalls, listCalls } = buildApp();

		expect((await app.handle(get("/"))).status).toBe(401);
		expect((await app.handle(get("/", "user-token"))).status).toBe(403);
		expect((await app.handle(get("/halloween-2026/stats"))).status).toBe(401);
		expect((await app.handle(get("/halloween-2026/stats", "user-token"))).status).toBe(403);
		expect(listCalls()).toBe(0);
		expect(statsCalls).toHaveLength(0);
	});

	it("lists the events to an admin", async () => {
		const { app } = buildApp();

		const response = await app.handle(get("/", "admin-token"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(EVENTS);
	});

	it("answers an event's stats to an admin, passing the clock", async () => {
		const { app, statsCalls } = buildApp();

		const response = await app.handle(get("/halloween-2026/stats", "admin-token"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(STATS);
		expect(statsCalls).toEqual([{ eventId: "halloween-2026", now: NOW }]);
	});

	it("answers 404 for an unknown event", async () => {
		const { app } = buildApp();

		expect((await app.handle(get("/nope/stats", "admin-token"))).status).toBe(404);
	});
});
