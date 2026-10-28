import { afterAll, describe, expect, it, spyOn } from "bun:test";

import { Cosmetic } from "../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticTier } from "../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../src/modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../../../src/modules/catalog/infrastructure/CosmeticPostgresRepository";
import { BotLoadoutPostgresRepository } from "../../../../src/modules/loadout/infrastructure/BotLoadoutPostgresRepository";
import { botLoadoutRouter } from "../../../../src/server/routes/bot-loadout-router";

// HTTP wiring only: Postgres-backed repositories are replaced with in-memory stand-ins.
const playmat = Cosmetic.from({
	id: "playmat-1",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.DONOR,
	assetRef: "playmats/halloween-graveyard/",
	displayName: "Graveyard",
	active: true,
	assetFiles: ["render.jpg"],
});

const requestedBots: string[] = [];
const spies = [
	spyOn(BotLoadoutPostgresRepository.prototype, "findByBotName").mockImplementation(
		async (botName) => {
			requestedBots.push(botName);
			return botName === "Gravekeepers"
				? [{ cosmeticType: CosmeticType.PLAYMAT, cosmeticId: playmat.id }]
				: [];
		},
	),
	spyOn(CosmeticPostgresRepository.prototype, "findById").mockImplementation(async (id) =>
		id === playmat.id ? playmat : null,
	),
];

afterAll(() => {
	for (const spy of spies) spy.mockRestore();
});

const get = (botName: string) =>
	botLoadoutRouter.handle(new Request(`http://localhost/bots/${botName}/loadout`));

describe("GET /bots/:botName/loadout", () => {
	it("serves a seeded bot's loadout without a token, with signed URLs uncached", async () => {
		const response = await get("Gravekeepers");

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		const body = (await response.json()) as {
			cosmeticType: string;
			cosmeticId: string;
			assets: Record<string, string>;
		}[];
		expect(body).toHaveLength(1);
		expect(body[0]).toMatchObject({ cosmeticType: "PLAYMAT", cosmeticId: "playmat-1" });
		expect(Object.keys(body[0].assets)).toEqual(["render.jpg"]);
	});

	it("answers an unknown bot with an empty loadout, like a user with nothing equipped", async () => {
		const response = await get("Nobody");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	it("decodes bot names that contain spaces", async () => {
		await get("Blue%20Eyes");

		expect(requestedBots).toContain("Blue Eyes");
	});
});
