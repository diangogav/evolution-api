import { afterAll, describe, expect, it, spyOn } from "bun:test";
import { Elysia } from "elysia";

import { config } from "../../../../src/config";
import { Cosmetic } from "../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticTier } from "../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../src/modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../../../src/modules/catalog/infrastructure/CosmeticPostgresRepository";
import { EntitlementPostgresRepository } from "../../../../src/modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { Loadout } from "../../../../src/modules/loadout/domain/Loadout";
import { LoadoutPostgresRepository } from "../../../../src/modules/loadout/infrastructure/LoadoutPostgresRepository";
import { UserBanPostgresRepository } from "../../../../src/modules/user/infrastructure/UserBanPostgresRepository";
import { loadoutRouter } from "../../../../src/server/routes/loadout-router";
import { meCosmeticsRouter } from "../../../../src/server/routes/me-cosmetics-router";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { NotFoundError } from "../../../../src/shared/errors/NotFoundError";
import { JWT } from "../../../../src/shared/JWT";
import { UserBanMother } from "../../modules/users/mothers/UserBanMother";

// This suite proves the HTTP wiring, not the catalog/loadout business logic
// (already covered by application-layer unit tests): a banned bearer is
// rejected before reaching the handler, a missing bearer still answers 401,
// and a non-banned bearer still reaches the real handler and gets its normal
// response. It never touches Postgres: every *PostgresRepository method the
// request path can reach is replaced with an in-memory stand-in via `spyOn`,
// keyed off the request's user id.

const bannedUserId = "user-banned-1";
const okUserId = "user-ok-1";
const bannedBan = UserBanMother.create({ userId: bannedUserId });

const testCosmetic = Cosmetic.from({
	id: "cosmetic-1",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.STANDARD,
	assetRef: "sleeves/test/",
	displayName: "Test Sleeve",
	active: true,
	assetFiles: ["render.jpg"],
});

const jwt = new JWT(config.jwt);
const wrongSecretJwt = new JWT({ ...config.jwt, secret: "wrong-secret" });
const app = new Elysia()
	.onError(({ error, set }) => {
		if (error instanceof AuthenticationError) set.status = 401;
		if (error instanceof ForbiddenError) set.status = 403;
		if (error instanceof NotFoundError) set.status = 404;
	})
	.use(meCosmeticsRouter)
	.use(loadoutRouter);

const loadoutSaveSpy = spyOn(LoadoutPostgresRepository.prototype, "save").mockImplementation(
	async () => undefined,
);

const spies = [
	spyOn(UserBanPostgresRepository.prototype, "findActiveBanByUserId").mockImplementation(
		async (userId) => (userId === bannedUserId ? bannedBan : null),
	),
	spyOn(CosmeticPostgresRepository.prototype, "findAll").mockImplementation(async () => [
		testCosmetic,
	]),
	spyOn(CosmeticPostgresRepository.prototype, "findById").mockImplementation(async (id) =>
		id === testCosmetic.id ? testCosmetic : null,
	),
	spyOn(EntitlementPostgresRepository.prototype, "findByUserId").mockImplementation(async () => []),
	spyOn(LoadoutPostgresRepository.prototype, "findByUserId").mockImplementation(async (userId) =>
		Loadout.from(userId, [{ cosmeticType: CosmeticType.SLEEVE, cosmeticId: testCosmetic.id }]),
	),
	loadoutSaveSpy,
];

afterAll(() => {
	for (const spy of spies) spy.mockRestore();
});

type RouteCase = {
	name: string;
	method: string;
	path: string;
	body?: unknown;
	// Proves the real handler ran for this user, not just that it wasn't blocked.
	assertBody: (json: unknown) => void;
};

const cases: RouteCase[] = [
	{
		name: "list my cosmetics catalog",
		method: "GET",
		path: "/me/cosmetics/",
		assertBody: (json) => {
			const catalog = json as { id: string }[];
			expect(catalog[0]?.id).toBe(testCosmetic.id);
		},
	},
	{
		name: "refresh a cosmetic asset manifest",
		method: "GET",
		path: `/me/cosmetics/${testCosmetic.id}/assets`,
		assertBody: (json) => {
			const manifest = json as { assets: Record<string, string> };
			expect(manifest.assets["render.jpg"]).toContain("render.jpg");
		},
	},
	{
		name: "get my loadout",
		method: "GET",
		path: "/me/loadout/",
		assertBody: (json) => {
			const loadout = json as { cosmeticId: string }[];
			expect(loadout[0]?.cosmeticId).toBe(testCosmetic.id);
		},
	},
	{
		name: "equip a cosmetic",
		method: "PUT",
		path: "/me/loadout/",
		body: { cosmeticType: CosmeticType.SLEEVE, cosmeticId: testCosmetic.id },
		assertBody: (json) => {
			const loadout = json as { cosmeticId: string }[];
			expect(loadout[0]?.cosmeticId).toBe(testCosmetic.id);
		},
	},
];

function request(routeCase: RouteCase, token?: string) {
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	if (routeCase.body) headers["Content-Type"] = "application/json";
	return app.handle(
		new Request(`http://localhost${routeCase.path}`, {
			method: routeCase.method,
			headers,
			body: routeCase.body ? JSON.stringify(routeCase.body) : undefined,
		}),
	);
}

const invalidTokens: { name: string; token: string }[] = [
	{ name: "malformed", token: "not-a-valid-jwt" },
	{ name: "badly signed", token: wrongSecretJwt.generate({ id: okUserId }) },
];

describe("banGuard on the cosmetics and loadout routes", () => {
	for (const routeCase of cases) {
		it(`answers 401 for ${routeCase.name} without a token`, async () => {
			const response = await request(routeCase);
			expect(response.status).toBe(401);
		});

		for (const invalidToken of invalidTokens) {
			it(`answers 401 for ${routeCase.name} with a ${invalidToken.name} token`, async () => {
				const response = await request(routeCase, invalidToken.token);
				expect(response.status).toBe(401);
			});
		}

		it(`answers 403 for ${routeCase.name} when the user is banned`, async () => {
			loadoutSaveSpy.mockClear();
			const token = jwt.generate({ id: bannedUserId });

			const response = await request(routeCase, token);

			expect(response.status).toBe(403);
			if (routeCase.method === "PUT") {
				// The guard must stop the write itself, not merely the status code.
				expect(loadoutSaveSpy).toHaveBeenCalledTimes(0);
			}
		});

		it(`still answers normally for ${routeCase.name} when the user is not banned`, async () => {
			const token = jwt.generate({ id: okUserId });

			const response = await request(routeCase, token);

			expect(response.status).toBe(200);
			routeCase.assertBody(await response.json());
		});
	}
});
