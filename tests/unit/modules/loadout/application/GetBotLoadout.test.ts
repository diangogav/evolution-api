import { describe, expect, it } from "bun:test";

import { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { GetBotLoadout } from "../../../../../src/modules/loadout/application/GetBotLoadout";
import { GetMyLoadout } from "../../../../../src/modules/loadout/application/GetMyLoadout";
import { BotLoadoutRepository } from "../../../../../src/modules/loadout/domain/BotLoadoutRepository";
import { Loadout } from "../../../../../src/modules/loadout/domain/Loadout";
import { LoadoutRepository } from "../../../../../src/modules/loadout/domain/LoadoutRepository";

const avatar = Cosmetic.from({
	id: "avatar-1",
	type: CosmeticType.AVATAR,
	tier: CosmeticTier.DONOR,
	assetRef: "avatars/halloween-graveyard/",
	displayName: "Graveyard",
	active: true,
});
const sleeve = Cosmetic.from({
	id: "sleeve-1",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.DONOR,
	assetRef: "sleeves/halloween-graveyard/",
	displayName: "Graveyard",
	active: true,
});
const catalog = new Map<string, Cosmetic>([
	[avatar.id, avatar],
	[sleeve.id, sleeve],
]);

const botLoadouts: Record<string, { cosmeticType: CosmeticType; cosmeticId: string }[]> = {
	Lich: [
		{ cosmeticType: CosmeticType.AVATAR, cosmeticId: avatar.id },
		{ cosmeticType: CosmeticType.SLEEVE, cosmeticId: sleeve.id },
	],
};

const cosmetics: CosmeticRepository = {
	findAll: async () => [...catalog.values()],
	findById: async (id) => catalog.get(id) ?? null,
	save: async () => undefined,
};
const signer: AssetUrlSigner = {
	sign: () => "",
	signMany: () => ({}),
	signManifest: async (prefix) => ({
		assets: { "render.jpg": `signed:${prefix}render.jpg` },
		expiresAt: "2030-01-01T00:00:00.000Z",
	}),
};

function userLoadoutOf(items: { cosmeticType: CosmeticType; cosmeticId: string }[]): GetMyLoadout {
	const loadouts: LoadoutRepository = {
		findByUserId: async (userId) => Loadout.from(userId, items),
		save: async () => undefined,
	};
	return new GetMyLoadout(loadouts, cosmetics, signer);
}

function build(): GetBotLoadout {
	const bots: BotLoadoutRepository = {
		findByBotName: async (botName) => botLoadouts[botName] ?? [],
	};
	return new GetBotLoadout(bots, userLoadoutOf([]));
}

describe("GetBotLoadout", () => {
	it("signs a bot's equipped slots exactly like a user loadout with the same items", async () => {
		const asUser = await userLoadoutOf(botLoadouts.Lich).run("user-1");

		const result = await build().run("Lich");

		expect(result).toEqual(asUser);
		expect(result).toEqual([
			{
				cosmeticType: CosmeticType.AVATAR,
				cosmeticId: "avatar-1",
				assets: { "render.jpg": "signed:avatars/halloween-graveyard/render.jpg" },
				assetsExpiresAt: "2030-01-01T00:00:00.000Z",
			},
			{
				cosmeticType: CosmeticType.SLEEVE,
				cosmeticId: "sleeve-1",
				assets: { "render.jpg": "signed:sleeves/halloween-graveyard/render.jpg" },
				assetsExpiresAt: "2030-01-01T00:00:00.000Z",
			},
		]);
	});

	it("answers an unknown bot like a user with an empty loadout", async () => {
		const emptyUser = await userLoadoutOf([]).run("user-1");

		const result = await build().run("Nobody");

		expect(result).toEqual(emptyUser);
		expect(result).toEqual([]);
	});
});
