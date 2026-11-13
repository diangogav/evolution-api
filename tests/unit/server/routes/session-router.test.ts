import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { EndSession } from "../../../../src/modules/auth/application/EndSession";
import { RefreshSession } from "../../../../src/modules/auth/application/RefreshSession";
import { SessionTokens } from "../../../../src/modules/auth/application/SessionTokens";
import { createSessionRouter } from "../../../../src/server/routes/session-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { JWT } from "../../../../src/shared/JWT";
import { InMemoryRefreshTokens } from "../../modules/auth/InMemoryRefreshTokens";
import { UserMother } from "../../modules/users/mothers/UserMother";

function buildApp({ banned = false } = {}) {
	const tokens = new InMemoryRefreshTokens();
	const sessionTokens = new SessionTokens(tokens);
	const jwt = new JWT({ issuer: "issuer", secret: "secret" });
	const user = UserMother.create({ id: "user-1", username: "duelist" });
	const router = createSessionRouter({
		refresh: new RefreshSession(
			tokens,
			sessionTokens,
			{ findById: async (id) => (id === user.id ? user : null) },
			{ execute: async () => (banned ? { userId: user.id } : null) },
			jwt,
			{ info: () => undefined, error: () => undefined } as never,
		),
		end: new EndSession(tokens),
	});
	const app = new Elysia().onError(mapDomainErrorStatus).use(router);
	const post = (path: string, body: unknown) =>
		app.handle(
			new Request(`http://localhost/auth${path}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		);

	return {
		post,
		jwt,
		signIn: () => sessionTokens.issue({ userId: user.id, mustUpgrade: false, now: new Date() }),
	};
}

describe("session router", () => {
	it("renews a session and rotates the refresh token", async () => {
		const { post, jwt, signIn } = buildApp();
		const refreshToken = await signIn();

		const response = await post("/refresh", { refreshToken });

		expect(response.status).toBe(200);
		const body = (await response.json()) as { id: string; token: string; refreshToken: string };
		expect(body).toMatchObject({ id: "user-1", username: "duelist", mustUpgrade: false });
		expect(jwt.decode(body.token)).toMatchObject({ id: "user-1" });
		expect(body.refreshToken).not.toBe(refreshToken);
		expect((await post("/refresh", { refreshToken: body.refreshToken })).status).toBe(200);
	});

	it("answers 401 to an unknown token and to a request without one", async () => {
		const { post } = buildApp();

		expect((await post("/refresh", { refreshToken: "made-up" })).status).toBe(401);
		expect((await post("/refresh", {})).status).toBe(422);
	});

	it("answers 403 to a banned user", async () => {
		const { post, signIn } = buildApp({ banned: true });

		expect((await post("/refresh", { refreshToken: await signIn() })).status).toBe(403);
	});

	it("signs out with 204, after which the token no longer renews", async () => {
		const { post, signIn } = buildApp();
		const refreshToken = await signIn();

		const out = await post("/logout", { refreshToken });

		expect(out.status).toBe(204);
		expect((await post("/refresh", { refreshToken })).status).toBe(401);
		expect((await post("/logout", { refreshToken: "made-up" })).status).toBe(204);
	});
});
