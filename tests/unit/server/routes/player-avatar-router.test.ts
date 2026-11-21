import { afterAll, describe, expect, it, spyOn } from "bun:test";
import { Elysia } from "elysia";

import { config } from "../../../../src/config";
import type { AvatarConfig } from "../../../../src/modules/player-avatars/domain/AvatarConfig";
import { PlayerAvatarPostgresRepository } from "../../../../src/modules/player-avatars/infrastructure/PlayerAvatarPostgresRepository";
import { UserBanPostgresRepository } from "../../../../src/modules/user/infrastructure/UserBanPostgresRepository";
import { playerAvatarRouter } from "../../../../src/server/routes/player-avatar-router";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { InvalidArgumentError } from "../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../src/shared/errors/NotFoundError";
import { JWT } from "../../../../src/shared/JWT";
import { UserBanMother } from "../../modules/users/mothers/UserBanMother";

// HTTP wiring only: the Postgres repository is replaced with an in-memory map.
// The error mapping mirrors the entries of Server.onError that this router can reach.
const bannedUserId = "user-banned-1";
const playerId = "user-player-1";
const stored = new Map<string, AvatarConfig>();
const jwt = new JWT(config.jwt);

const app = new Elysia()
	.onError(({ error, set }) => {
		if (error instanceof AuthenticationError) set.status = 401;
		if (error instanceof ForbiddenError) set.status = 403;
		if (error instanceof InvalidArgumentError) set.status = 400;
		if (error instanceof NotFoundError) set.status = 404;
	})
	.use(playerAvatarRouter);

const spies = [
	spyOn(UserBanPostgresRepository.prototype, "findActiveBanByUserId").mockImplementation(
		async (userId) => (userId === bannedUserId ? UserBanMother.create({ userId }) : null),
	),
	spyOn(PlayerAvatarPostgresRepository.prototype, "findByUserId").mockImplementation(
		async (userId) => stored.get(userId) ?? null,
	),
	spyOn(PlayerAvatarPostgresRepository.prototype, "save").mockImplementation(
		async (userId, avatar) => {
			stored.set(userId, avatar);
		},
	),
	spyOn(PlayerAvatarPostgresRepository.prototype, "delete").mockImplementation(async (userId) => {
		stored.delete(userId);
	}),
];

afterAll(() => {
	for (const spy of spies) spy.mockRestore();
});

function call(method: string, token?: string, body?: unknown) {
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	if (body) headers["Content-Type"] = "application/json";
	return app.handle(
		new Request("http://localhost/me/avatar/", {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		}),
	);
}

const bodyFor = (method: string) => (method === "PUT" ? { hairStyle: "spiky" } : undefined);

describe("/me/avatar", () => {
	for (const method of ["GET", "PUT", "DELETE"]) {
		it(`answers 401 to ${method} without a token`, async () => {
			expect((await call(method, undefined, bodyFor(method))).status).toBe(401);
		});

		it(`answers 403 to ${method} when the user is banned`, async () => {
			const token = jwt.generate({ id: bannedUserId });
			expect((await call(method, token, bodyFor(method))).status).toBe(403);
		});
	}

	it("answers 404 before anything is saved", async () => {
		stored.clear();
		expect((await call("GET", jwt.generate({ id: playerId }))).status).toBe(404);
	});

	it("saves on PUT and returns it on GET", async () => {
		stored.clear();
		const token = jwt.generate({ id: playerId });

		const saved = await call("PUT", token, { hairStyle: "spiky", hairColor: "purple" });
		expect(saved.status).toBe(200);
		expect(await saved.json()).toEqual({ config: { hairStyle: "spiky", hairColor: "purple" } });

		const read = await call("GET", token);
		expect(read.status).toBe(200);
		expect(await read.json()).toEqual({ config: { hairStyle: "spiky", hairColor: "purple" } });
	});

	it("answers 400 to a value that breaks the shape rules", async () => {
		stored.clear();
		const response = await call("PUT", jwt.generate({ id: playerId }), { hairStyle: "Spiky!" });
		expect(response.status).toBe(400);
		expect(stored.size).toBe(0);
	});

	it("brings the 404 back after DELETE", async () => {
		stored.set(playerId, { hairStyle: "bob" });
		const token = jwt.generate({ id: playerId });
		expect((await call("DELETE", token)).status).toBe(204);
		expect((await call("GET", token)).status).toBe(404);
	});
});
