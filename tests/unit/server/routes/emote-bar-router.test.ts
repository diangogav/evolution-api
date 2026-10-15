import { afterAll, describe, expect, it, spyOn } from "bun:test";
import { Elysia } from "elysia";

import { config } from "../../../../src/config";
import { Cosmetic } from "../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticTier } from "../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../src/modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../../../src/modules/catalog/infrastructure/CosmeticPostgresRepository";
import { EmoteBar } from "../../../../src/modules/emote-bar/domain/EmoteBar";
import { DEFAULT_EMOTE_IDS } from "../../../../src/modules/emote-bar/domain/EmoteRef";
import { EmoteBarPostgresRepository } from "../../../../src/modules/emote-bar/infrastructure/EmoteBarPostgresRepository";
import { Entitlement } from "../../../../src/modules/entitlements/domain/Entitlement";
import { EntitlementSource } from "../../../../src/modules/entitlements/domain/EntitlementSource";
import { GrantType } from "../../../../src/modules/entitlements/domain/GrantType";
import { EntitlementPostgresRepository } from "../../../../src/modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { UserBanPostgresRepository } from "../../../../src/modules/user/infrastructure/UserBanPostgresRepository";
import { emoteBarRouter } from "../../../../src/server/routes/emote-bar-router";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { InvalidArgumentError } from "../../../../src/shared/errors/InvalidArgumentError";
import { JWT } from "../../../../src/shared/JWT";
import { UserBanMother } from "../../modules/users/mothers/UserBanMother";

// HTTP wiring only: Postgres-backed repositories are replaced with in-memory stand-ins.
// The error mapping mirrors the three entries of Server.onError that this router can reach.
const bannedUserId = "user-banned-1";
const ownerId = "user-owner-1";
const strangerId = "user-stranger-1";

const pack = Cosmetic.from({
	id: "pack-1",
	type: CosmeticType.EMOTE_PACK,
	tier: CosmeticTier.DONOR,
	assetRef: "emote-packs/halloween/",
	displayName: "Halloween",
	active: true,
	assetFiles: ["pack.json", "ghost.json"],
});

let stored: string[] | null = null;
const jwt = new JWT(config.jwt);
const app = new Elysia()
	.onError(({ error, set }) => {
		if (error instanceof AuthenticationError) set.status = 401;
		if (error instanceof ForbiddenError) set.status = 403;
		if (error instanceof InvalidArgumentError) set.status = 400;
	})
	.use(emoteBarRouter);

const spies = [
	spyOn(UserBanPostgresRepository.prototype, "findActiveBanByUserId").mockImplementation(
		async (userId) => (userId === bannedUserId ? UserBanMother.create({ userId }) : null),
	),
	spyOn(CosmeticPostgresRepository.prototype, "findAll").mockImplementation(async () => [pack]),
	spyOn(EntitlementPostgresRepository.prototype, "findByUserId").mockImplementation(
		async (userId) =>
			userId === ownerId
				? [
						Entitlement.create({
							id: "e1",
							userId,
							grantType: GrantType.COSMETIC,
							grantValue: pack.id,
							source: EntitlementSource.CAMPAIGN,
							expiresAt: null,
						}),
					]
				: [],
	),
	spyOn(EmoteBarPostgresRepository.prototype, "findByUserId").mockImplementation(
		async () => stored,
	),
	spyOn(EmoteBarPostgresRepository.prototype, "save").mockImplementation(async (_id, bar) => {
		stored = bar.refs().map(String);
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
		new Request("http://localhost/me/emote-bar/", {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
		}),
	);
}

const bodyFor = (method: string) =>
	method === "PUT" ? { slots: [...DEFAULT_EMOTE_IDS] } : undefined;

const withPackEmote = (): string[] => ["halloween/ghost", ...DEFAULT_EMOTE_IDS.slice(1)];

describe("/me/emote-bar", () => {
	for (const method of ["GET", "PUT"]) {
		it(`answers 401 to ${method} without a token`, async () => {
			expect((await call(method, undefined, bodyFor(method))).status).toBe(401);
		});

		it(`answers 403 to ${method} when the user is banned`, async () => {
			const token = jwt.generate({ id: bannedUserId });
			expect((await call(method, token, bodyFor(method))).status).toBe(403);
		});
	}

	it("returns the default bar for a user with no saved bar", async () => {
		stored = null;

		const response = await call("GET", jwt.generate({ id: ownerId }));

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		const body = (await response.json()) as { slots: { ref: string }[] };
		expect(body.slots.map((slot) => slot.ref)).toEqual([...DEFAULT_EMOTE_IDS]);
	});

	it("saves a bar and answers with the resolved slots", async () => {
		stored = null;

		const response = await call("PUT", jwt.generate({ id: ownerId }), { slots: withPackEmote() });

		expect(response.status).toBe(200);
		const body = (await response.json()) as { slots: { ref: string; packId: string | null }[] };
		expect(body.slots[0]).toMatchObject({ ref: "halloween/ghost", packId: "pack-1" });
		expect(stored as string[] | null).toEqual(withPackEmote());
	});

	it("answers 403 when saving a pack the user does not own", async () => {
		stored = null;

		const response = await call("PUT", jwt.generate({ id: strangerId }), {
			slots: withPackEmote(),
		});

		expect(response.status).toBe(403);
		expect(stored).toBeNull();
	});

	it("answers 400 for an unknown emote", async () => {
		const response = await call("PUT", jwt.generate({ id: ownerId }), {
			slots: ["halloween/zombie", ...DEFAULT_EMOTE_IDS.slice(1)],
		});

		expect(response.status).toBe(400);
	});

	it("rejects a body whose slots are not 8 strings before reaching the use case", async () => {
		const response = await call("PUT", jwt.generate({ id: ownerId }), { slots: ["wave"] });

		expect(response.status).toBe(422);
	});
});
