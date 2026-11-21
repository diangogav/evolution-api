import { afterAll, describe, expect, it, spyOn } from "bun:test";
import { Elysia } from "elysia";

import type { AvatarConfig } from "../../../../src/modules/player-avatars/domain/AvatarConfig";
import { PlayerAvatarPostgresRepository } from "../../../../src/modules/player-avatars/infrastructure/PlayerAvatarPostgresRepository";
import { publicAvatarsRouter } from "../../../../src/server/routes/public-avatars-router";
import { InvalidArgumentError } from "../../../../src/shared/errors/InvalidArgumentError";

const stored = new Map<string, AvatarConfig>([
	["u1", { hairStyle: "bob" }],
	["u3", { hairStyle: "afro" }],
]);

const app = new Elysia()
	.onError(({ error, set }) => {
		if (error instanceof InvalidArgumentError) set.status = 400;
	})
	.use(publicAvatarsRouter);

const spy = spyOn(PlayerAvatarPostgresRepository.prototype, "findByUserIds").mockImplementation(
	async (userIds) => {
		const found = new Map<string, AvatarConfig>();
		for (const id of userIds) {
			const config = stored.get(id);
			if (config) found.set(id, config);
		}
		return found;
	},
);

afterAll(() => spy.mockRestore());

const get = (query: string) => app.handle(new Request(`http://localhost/avatars${query}`));

describe("GET /avatars", () => {
	it("answers the avatars of the requested users without a token", async () => {
		const response = await get("?userIds=u1,u2,u3");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			avatars: [
				{ userId: "u1", config: { hairStyle: "bob" } },
				{ userId: "u3", config: { hairStyle: "afro" } },
			],
		});
	});

	it("sets a short public cache", async () => {
		const response = await get("?userIds=u1");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
	});

	it("answers 400 above 100 ids", async () => {
		const ids = Array.from({ length: 101 }, (_, i) => `u${i}`).join(",");
		expect((await get(`?userIds=${ids}`)).status).toBe(400);
	});

	it("answers 422 without userIds", async () => {
		expect((await get("")).status).toBe(422);
	});
});
