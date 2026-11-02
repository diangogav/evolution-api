import { describe, expect, it } from "bun:test";
import { Elysia, t } from "elysia";

import { config } from "../../../../src/config";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { JWT } from "../../../../src/shared/JWT";

const jwt = new JWT(config.jwt);
const bannedUserId = "user-banned";

function appWith() {
	const decoded: string[] = [];
	const banChecks: string[] = [];
	const handled: string[] = [];
	const requireUser = createRequireUser({
		jwt: {
			decode: (token) => {
				decoded.push(token);
				return jwt.decode(token);
			},
		},
		activeBans: {
			execute: async (userId) => {
				banChecks.push(userId);
				return userId === bannedUserId ? { userId } : null;
			},
		},
	});
	const app = new Elysia()
		.onError(mapDomainErrorStatus)
		.get("/public", () => "public")
		.guard({}, (guarded) =>
			guarded.use(requireUser).get(
				"/me",
				({ userId }) => {
					handled.push(userId);
					return { userId };
				},
				{ query: t.Object({ period: t.Optional(t.Literal("daily")) }) },
			),
		)
		.get("/after", () => "after");
	return { app, decoded, banChecks, handled };
}

const get = (app: { handle(request: Request): Promise<Response> }, path: string, token?: string) =>
	app.handle(
		new Request(`http://localhost${path}`, {
			headers: token ? { authorization: `Bearer ${token}` } : {},
		}),
	);

describe("requireUser", () => {
	it("hands the token's user id to the handler, verifying the token and the ban once", async () => {
		const { app, decoded, banChecks } = appWith();

		const response = await get(app, "/me", jwt.generate({ id: "user-1" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ userId: "user-1" });
		expect(decoded).toHaveLength(1);
		expect(banChecks).toEqual(["user-1"]);
	});

	it("answers 401 without a bearer token and never reaches the handler", async () => {
		const { app, handled } = appWith();

		const response = await get(app, "/me");

		expect(response.status).toBe(401);
		expect(await response.text()).toBe("No token provided");
		expect(handled).toEqual([]);
	});

	it("answers 401 for a token signed with another secret", async () => {
		const { app, handled } = appWith();
		const forged = new JWT({ ...config.jwt, secret: "another-secret" }).generate({ id: "user-1" });

		const response = await get(app, "/me", forged);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe("Invalid token");
		expect(handled).toEqual([]);
	});

	it("answers 401 for an expired token", async () => {
		const { app } = appWith();
		const expired = jwt.generate({ id: "user-1" }, { expiresIn: -10 });

		const response = await get(app, "/me", expired);

		expect(response.status).toBe(401);
	});

	it("answers 401 for a valid token that carries no user id", async () => {
		const { app, banChecks } = appWith();

		const response = await get(app, "/me", jwt.generate({ role: "USER" }));

		expect(response.status).toBe(401);
		expect(await response.text()).toBe("Token has no user id");
		expect(banChecks).toEqual([]);
	});

	it("answers 403 for a banned user and never reaches the handler", async () => {
		const { app, handled } = appWith();

		const response = await get(app, "/me", jwt.generate({ id: bannedUserId }));

		expect(response.status).toBe(403);
		expect(await response.text()).toBe("User is banned");
		expect(handled).toEqual([]);
	});

	it("still validates the request before authenticating it", async () => {
		const { app, decoded } = appWith();

		const response = await get(app, "/me?period=yearly");

		expect(response.status).toBe(422);
		expect(decoded).toEqual([]);
	});

	it("leaves routes outside the guarded group public", async () => {
		const { app, decoded } = appWith();

		expect((await get(app, "/public")).status).toBe(200);
		expect((await get(app, "/after")).status).toBe(200);
		expect(decoded).toEqual([]);
	});
});
