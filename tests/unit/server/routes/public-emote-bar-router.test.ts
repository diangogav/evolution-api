import { afterAll, describe, expect, it, spyOn } from "bun:test";
import { Elysia } from "elysia";

import { Cosmetic } from "../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticTier } from "../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../src/modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../../../src/modules/catalog/infrastructure/CosmeticPostgresRepository";
import { DEFAULT_EMOTE_IDS } from "../../../../src/modules/emote-bar/domain/EmoteRef";
import { EmoteBarPostgresRepository } from "../../../../src/modules/emote-bar/infrastructure/EmoteBarPostgresRepository";
import { Entitlement } from "../../../../src/modules/entitlements/domain/Entitlement";
import { EntitlementSource } from "../../../../src/modules/entitlements/domain/EntitlementSource";
import { GrantType } from "../../../../src/modules/entitlements/domain/GrantType";
import { EntitlementPostgresRepository } from "../../../../src/modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { UserDirectoryPostgresRepository } from "../../../../src/modules/loadout/infrastructure/UserDirectoryPostgresRepository";
import { publicEmoteBarRouter } from "../../../../src/server/routes/public-emote-bar-router";
import { NotFoundError } from "../../../../src/shared/errors/NotFoundError";

// HTTP wiring only: Postgres-backed repositories are replaced with in-memory stand-ins.
const pack = Cosmetic.from({
	id: "pack-1",
	type: CosmeticType.EMOTE_PACK,
	tier: CosmeticTier.DONOR,
	assetRef: "emote-packs/halloween/",
	displayName: "Halloween",
	active: true,
	assetFiles: ["pack.json", "ghost.json"],
});

const app = new Elysia()
	.onError(({ error, set }) => {
		if (error instanceof NotFoundError) set.status = 404;
	})
	.use(publicEmoteBarRouter);

const spies = [
	spyOn(UserDirectoryPostgresRepository.prototype, "findUserIdByUsername").mockImplementation(
		async (username) => (username === "rival" ? "user-rival" : null),
	),
	spyOn(CosmeticPostgresRepository.prototype, "findAll").mockImplementation(async () => [pack]),
	spyOn(EntitlementPostgresRepository.prototype, "findByUserId").mockImplementation(
		async (userId) => [
			Entitlement.create({
				id: "e1",
				userId,
				grantType: GrantType.COSMETIC,
				grantValue: pack.id,
				source: EntitlementSource.CAMPAIGN,
				expiresAt: null,
			}),
		],
	),
	spyOn(EmoteBarPostgresRepository.prototype, "findByUserId").mockImplementation(async () => [
		"halloween/ghost",
		...DEFAULT_EMOTE_IDS.slice(1),
	]),
];

afterAll(() => {
	for (const spy of spies) spy.mockRestore();
});

const get = (username: string) =>
	app.handle(new Request(`http://localhost/users/by-username/${username}/emote-bar`));

describe("GET /users/by-username/:username/emote-bar", () => {
	it("serves the bar of an existing user without a token, with signed URLs uncached", async () => {
		const response = await get("rival");

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		const body = (await response.json()) as { slots: { ref: string; packId: string | null }[] };
		expect(body.slots).toHaveLength(DEFAULT_EMOTE_IDS.length);
		expect(body.slots[0]).toMatchObject({ ref: "halloween/ghost", packId: "pack-1" });
	});

	it("answers 404 when the username does not exist", async () => {
		expect((await get("ghost")).status).toBe(404);
	});
});
