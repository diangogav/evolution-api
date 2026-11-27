import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { ListMySessions } from "../../../../src/modules/auth/application/ListMySessions";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import { createMeSessionsRouter } from "../../../../src/server/routes/me-sessions-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { InMemoryRefreshTokens } from "../../modules/auth/InMemoryRefreshTokens";

const SIGNED_IN = new Date("2026-11-20T18:04:00Z");

async function buildApp() {
	const tokens = new InMemoryRefreshTokens();
	await tokens.save({
		id: "token-1",
		userId: "user-1",
		familyId: "family-1",
		tokenHash: "hash-1",
		mustUpgrade: false,
		createdAt: SIGNED_IN,
		// Far ahead, so the router's real clock never sees it expired.
		expiresAt: new Date("2100-01-01T00:00:00Z"),
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
		signedInAt: SIGNED_IN,
	});
	const router = createMeSessionsRouter({
		// The bearer token is "<user id>:<sid>", so a test names who calls and from where.
		requireUser: createRequireUser({
			jwt: {
				decode: (token) => {
					const [id, sid] = token.split(":");
					return { id, sid };
				},
			},
			activeBans: { execute: async () => null },
		}),
		list: new ListMySessions(tokens),
	});
	return new Elysia().onError(mapDomainErrorStatus).use(router);
}

const get = (app: { handle(request: Request): Promise<Response> }, token?: string) =>
	app.handle(
		new Request("http://localhost/me/sessions", {
			headers: token ? { authorization: `Bearer ${token}` } : {},
		}),
	);

describe("GET /me/sessions", () => {
	it("lists the caller's devices with the calling one marked", async () => {
		const response = await get(await buildApp(), "user-1:family-1");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([
			{
				id: "family-1",
				browser: "Firefox",
				os: "Windows",
				signedInAt: "2026-11-20T18:04:00.000Z",
				lastUsedAt: "2026-11-20T18:04:00.000Z",
				current: true,
			},
		]);
	});

	it("answers an empty list to a user with no devices", async () => {
		const response = await get(await buildApp(), "user-2:family-9");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	it("answers 401 without a token", async () => {
		expect((await get(await buildApp())).status).toBe(401);
	});
});
