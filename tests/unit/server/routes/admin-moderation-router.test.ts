import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { AnnulMatchesUseCase } from "../../../../src/modules/match-annulment/application/AnnulMatchesUseCase";
import type { UnannulMatchesUseCase } from "../../../../src/modules/match-annulment/application/UnannulMatchesUseCase";
import type { AnnulMatchesResponse } from "../../../../src/modules/match-annulment/application/dtos/AnnulMatches";
import type { UnannulMatchesResponse } from "../../../../src/modules/match-annulment/application/dtos/UnannulMatches";
import type { MatchAnnulmentRepository } from "../../../../src/modules/match-annulment/domain/MatchAnnulmentRepository";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ConflictError } from "../../../../src/shared/errors/ConflictError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { InvalidArgumentError } from "../../../../src/shared/errors/InvalidArgumentError";
import { createAdminModerationRouter } from "../../../../src/server/routes/admin-moderation-router";

const ANNUL_RESPONSE: AnnulMatchesResponse = {
	results: [
		{
			gameId: "game-1",
			outcome: "annulled",
			pointsRows: 2,
			eloReversed: 2,
			eloSkipped: 0,
			eloReinstated: 0,
		},
	],
	totals: { eloReversed: 2, eloSkipped: 0 },
};

const UNANNUL_RESPONSE: UnannulMatchesResponse = {
	results: [
		{
			gameId: "game-1",
			outcome: "un-annulled",
			pointsRows: 2,
			eloReversed: 0,
			eloSkipped: 0,
			eloReinstated: 0,
		},
	],
	totals: { eloReinstated: 0, eloSkipped: 0 },
};

function buildApp(
	annulMatches: Partial<AnnulMatchesUseCase> = { run: async () => ANNUL_RESPONSE },
	unannulMatches: Partial<UnannulMatchesUseCase> = { run: async () => UNANNUL_RESPONSE },
) {
	return new Elysia()
		.onError(({ error, set }) => {
			if (error instanceof AuthenticationError) set.status = 401;
			if (error instanceof ForbiddenError) set.status = 403;
			if (error instanceof InvalidArgumentError) set.status = 400;
			if (error instanceof ConflictError) set.status = 409;
		})
		.use(
			createAdminModerationRouter({
				authorizer: {
					requireAdmin: (token) => {
						if (!token) throw new AuthenticationError("missing");
						if (token !== "admin-token") throw new ForbiddenError("admin required");
						return { userId: "admin-1" };
					},
				},
				annulMatches: annulMatches as AnnulMatchesUseCase,
				unannulMatches: unannulMatches as UnannulMatchesUseCase,
			}),
		);
}

function annulRequest(body: unknown) {
	return new Request("http://localhost/admin/matches/annulments", {
		method: "POST",
		headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("admin moderation routes", () => {
	it("rejects an unauthenticated and a non-admin annul request", async () => {
		const body = { gameIds: ["game-1"], reason: "cheating", offenderUserId: "user-1" };
		const unauthenticated = await buildApp().handle(
			new Request("http://localhost/admin/matches/annulments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
		);
		expect(unauthenticated.status).toBe(401);

		const nonAdmin = await buildApp().handle(
			new Request("http://localhost/admin/matches/annulments", {
				method: "POST",
				headers: { Authorization: "Bearer user-token", "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
		);
		expect(nonAdmin.status).toBe(403);
	});

	it("rejects an empty game id list or a missing reason before any game is processed", async () => {
		let calls = 0;
		const repository: MatchAnnulmentRepository = {
			annulPhaseOne: async () => {
				calls++;
				return { outcome: "not-found" };
			},
			unannulPhaseOne: async () => ({ outcome: "not-found" }),
		};
		const realUseCase = new AnnulMatchesUseCase(
			repository,
			{ compensate: async () => ({ reversed: 0, skipped: 0 }) },
			true,
		);
		const app = buildApp(realUseCase);

		const emptyIds = await app.handle(
			annulRequest({ gameIds: [], reason: "cheating", offenderUserId: "user-1" }),
		);
		expect(emptyIds.status).toBe(400);

		const blankReason = await app.handle(
			annulRequest({ gameIds: ["game-1"], reason: "  ", offenderUserId: "user-1" }),
		);
		expect(blankReason.status).toBe(400);
		expect(calls).toBe(0);
	});

	it("returns 409 when the use case reports annulment is disabled", async () => {
		const response = await buildApp({
			run: async () => {
				throw new ConflictError("Match annulment is disabled");
			},
		}).handle(annulRequest({ gameIds: ["game-1"], reason: "cheating", offenderUserId: "user-1" }));
		expect(response.status).toBe(409);
	});

	it("annuls a batch for an administrator, sourcing adminUserId from the token principal", async () => {
		let received: unknown;
		const response = await buildApp({
			run: async (request) => {
				received = request;
				return ANNUL_RESPONSE;
			},
		}).handle(annulRequest({ gameIds: ["game-1"], reason: "cheating", offenderUserId: "user-1" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(ANNUL_RESPONSE);
		expect(received).toEqual({
			gameIds: ["game-1"],
			reason: "cheating",
			offenderUserId: "user-1",
			adminUserId: "admin-1",
		});
	});

	it("un-annuls a batch for an administrator", async () => {
		let received: unknown;
		const response = await buildApp(undefined, {
			run: async (request) => {
				received = request;
				return UNANNUL_RESPONSE;
			},
		}).handle(
			new Request("http://localhost/admin/matches/annulments/reversals", {
				method: "POST",
				headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
				body: JSON.stringify({ gameIds: ["game-1"] }),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(UNANNUL_RESPONSE);
		expect(received).toEqual({ gameIds: ["game-1"] });
	});
});
