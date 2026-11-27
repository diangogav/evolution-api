import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { ListMySessions } from "../../../../src/modules/auth/application/ListMySessions";
import { RevokeMyOtherSessions } from "../../../../src/modules/auth/application/RevokeMyOtherSessions";
import { RevokeMySession } from "../../../../src/modules/auth/application/RevokeMySession";
import { RevokeSessions } from "../../../../src/modules/auth/application/RevokeSessions";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import { createMeSessionsRouter } from "../../../../src/server/routes/me-sessions-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { InMemoryRefreshTokens } from "../../modules/auth/InMemoryRefreshTokens";
import { InMemoryRevokedSessions } from "../../modules/auth/InMemoryRevokedSessions";

const SIGNED_IN = new Date("2026-11-20T18:04:00Z");
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";

async function buildApp() {
	const tokens = new InMemoryRefreshTokens();
	const revoked = new InMemoryRevokedSessions();
	for (const [index, familyId] of ["family-1", "family-2"].entries()) {
		await tokens.save({
			id: `token-${index}`,
			userId: "user-1",
			familyId,
			tokenHash: `hash-${index}`,
			mustUpgrade: false,
			createdAt: SIGNED_IN,
			// Far ahead, so the router's real clock never sees it expired.
			expiresAt: new Date("2100-01-01T00:00:00Z"),
			userAgent: familyId === "family-1" ? FIREFOX : null,
			signedInAt: SIGNED_IN,
		});
	}
	const revokeSessions = new RevokeSessions(tokens, revoked);
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
			revokedSessions: revoked,
		}),
		list: new ListMySessions(tokens),
		revoke: new RevokeMySession(tokens, revokeSessions),
		revokeOthers: new RevokeMyOtherSessions(revokeSessions),
	});
	const app = new Elysia().onError(mapDomainErrorStatus).use(router);
	const call = (method: string, path: string, token?: string) =>
		app.handle(
			new Request(`http://localhost/me/sessions${path}`, {
				method,
				headers: token ? { authorization: `Bearer ${token}` } : {},
			}),
		);
	const ids = async (token: string) =>
		((await (await call("GET", "", token)).json()) as { id: string }[]).map((entry) => entry.id);

	return { call, ids };
}

describe("GET /me/sessions", () => {
	it("lists the caller's devices with the calling one marked first", async () => {
		const { call } = await buildApp();

		const response = await call("GET", "", "user-1:family-1");

		expect(response.status).toBe(200);
		expect(((await response.json()) as unknown[])[0]).toEqual({
			id: "family-1",
			browser: "Firefox",
			os: "Windows",
			signedInAt: "2026-11-20T18:04:00.000Z",
			lastUsedAt: "2026-11-20T18:04:00.000Z",
			current: true,
		});
	});

	it("answers an empty list to a user with no devices", async () => {
		const { call } = await buildApp();

		const response = await call("GET", "", "user-2:family-9");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	it("answers 401 without a token", async () => {
		const { call } = await buildApp();

		expect((await call("GET", "")).status).toBe(401);
	});
});

describe("DELETE /me/sessions/:id", () => {
	it("signs the device out and refuses its JWT from the next request", async () => {
		const { call, ids } = await buildApp();

		const response = await call("DELETE", "/family-2", "user-1:family-1");

		expect(response.status).toBe(204);
		expect(await ids("user-1:family-1")).toEqual(["family-1"]);
		expect((await call("GET", "", "user-1:family-2")).status).toBe(401);
	});

	it("answers 404 for a sign-in the caller does not have", async () => {
		const { call } = await buildApp();

		expect((await call("DELETE", "/family-1", "user-2:family-9")).status).toBe(404);
	});

	it("answers 401 without a token", async () => {
		const { call } = await buildApp();

		expect((await call("DELETE", "/family-2")).status).toBe(401);
	});
});

describe("DELETE /me/sessions", () => {
	it("signs every other device out and keeps the calling one", async () => {
		const { call, ids } = await buildApp();

		const response = await call("DELETE", "", "user-1:family-1");

		expect(response.status).toBe(204);
		expect(await ids("user-1:family-1")).toEqual(["family-1"]);
		expect((await call("GET", "", "user-1:family-2")).status).toBe(401);
	});

	it("answers 401 without a token", async () => {
		const { call } = await buildApp();

		expect((await call("DELETE", "")).status).toBe(401);
	});
});
