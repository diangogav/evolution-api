import { afterAll, describe, expect, it, spyOn } from "bun:test";
import { Elysia } from "elysia";

import { UserProfileRole } from "../../../../src/evolution-types/src/types/UserProfileRole";
import { UserBan } from "../../../../src/modules/user/domain/UserBan";
import { UserBanPostgresRepository } from "../../../../src/modules/user/infrastructure/UserBanPostgresRepository";
import { apiJwt } from "../../../../src/server/auth/apiJwt";
import { userRouter } from "../../../../src/server/routes/user-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";

// The ban endpoints of the user router are admin-only and stay outside requireUser, so
// an admin can act on a banned user. They authorize through the shared admin
// authorizer. Postgres is never touched: the ban repository is replaced in memory.

const banned: UserBan[] = [];
const spies = [
	spyOn(UserBanPostgresRepository.prototype, "userExists").mockImplementation(async () => true),
	spyOn(UserBanPostgresRepository.prototype, "banUser").mockImplementation(async (ban) => {
		banned.push(ban);
	}),
	spyOn(UserBanPostgresRepository.prototype, "finishActiveBan").mockImplementation(
		async () => undefined,
	),
	spyOn(UserBanPostgresRepository.prototype, "unbanUser").mockImplementation(async () => undefined),
	spyOn(UserBanPostgresRepository.prototype, "findActiveBanByUserId").mockImplementation(
		async () => null,
	),
	spyOn(UserBanPostgresRepository.prototype, "getBansByUserId").mockImplementation(async () => []),
];
afterAll(() => {
	for (const spy of spies) spy.mockRestore();
});

const app = new Elysia().onError(mapDomainErrorStatus).use(userRouter);
const adminToken = apiJwt.generate({ id: "admin-1", role: UserProfileRole.ADMIN });
const playerToken = apiJwt.generate({ id: "player-1", role: UserProfileRole.USER });

const routes: Array<[string, string, Record<string, unknown>?]> = [
	["POST", "/users/target-1/ban", { reason: "cheating" }],
	["POST", "/users/target-1/unban"],
	["GET", "/users/target-1/ban/active"],
	["GET", "/users/target-1/ban/history"],
];

const call = (method: string, path: string, body?: Record<string, unknown>, token?: string) =>
	app.handle(
		new Request(`http://localhost${path}`, {
			method,
			body: body ? JSON.stringify(body) : undefined,
			headers: {
				...(body ? { "content-type": "application/json" } : {}),
				...(token ? { authorization: `Bearer ${token}` } : {}),
			},
		}),
	);

describe("user router — admin ban endpoints", () => {
	for (const [method, path, body] of routes) {
		it(`${method} ${path} answers 401 without a bearer token`, async () => {
			const response = await call(method, path, body);

			expect(response.status).toBe(401);
			expect(await response.text()).toBe("Bearer token is required");
		});

		it(`${method} ${path} answers 403 for a non-admin token`, async () => {
			const response = await call(method, path, body, playerToken);

			expect(response.status).toBe(403);
			expect(await response.text()).toBe("Administrator role is required");
		});

		it(`${method} ${path} serves an admin`, async () => {
			const response = await call(method, path, body, adminToken);

			expect(response.status).toBe(200);
		});
	}

	it("records the admin from the token as the one who banned the user", async () => {
		banned.length = 0;

		await call("POST", "/users/target-1/ban", { reason: "cheating" }, adminToken);

		expect(banned).toHaveLength(1);
		expect(banned[0].bannedBy).toBe("admin-1");
		expect(banned[0].userId).toBe("target-1");
	});
});
