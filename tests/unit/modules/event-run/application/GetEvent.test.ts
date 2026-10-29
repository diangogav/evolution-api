import { describe, expect, it } from "bun:test";

import { AssetUrlSigner } from "../../../../../src/modules/assets/domain/AssetUrlSigner";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { GetEvent } from "../../../../../src/modules/event-run/application/GetEvent";
import { PrizeTier } from "../../../../../src/modules/event-run/domain/EventDefinition";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { EVENT_ID, halloween, NOW, USER, World } from "./fakes";

const EXPIRES_AT = "2026-10-31T21:00:00.000Z";

const sleeve = Cosmetic.from({
	id: "sleeve-3",
	type: CosmeticType.SLEEVE,
	tier: CosmeticTier.EXCLUSIVE,
	assetRef: "sleeves/pumpkin/",
	displayName: "Pumpkin Sleeve",
	active: true,
});
const playmat = Cosmetic.from({
	id: "playmat-8",
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.EXCLUSIVE,
	assetRef: "playmats/graveyard/",
	displayName: "Graveyard",
	active: true,
	assetFiles: ["background.webp"],
});

function build(world: World, catalog: Cosmetic[] = [sleeve, playmat]) {
	const lookups: string[] = [];
	const cosmetics: Pick<CosmeticRepository, "findById"> = {
		findById: async (id) => {
			lookups.push(id);
			return catalog.find((cosmetic) => cosmetic.id === id) ?? null;
		},
	};
	const signer: Pick<AssetUrlSigner, "signManifest"> = {
		signManifest: async (prefix, assetFiles) => ({
			assets: Object.fromEntries(
				(assetFiles ?? ["render.jpg"]).map((file) => [file, `https://signed/${prefix}${file}`]),
			),
			expiresAt: EXPIRES_AT,
		}),
	};
	const useCase = new GetEvent(
		world.catalog,
		world.runRepository,
		world.attemptRepository,
		cosmetics,
		signer,
	);
	return { useCase, lookups };
}

function withPrizes(world: World, prizeTiers: PrizeTier[]) {
	world.event = halloween({ prizeTiers });
}

describe("GetEvent", () => {
	it("returns the localized catalog with attempts left today and the best mark", async () => {
		const world = new World();
		world.attempts.set(`${USER}|${EVENT_ID}|2026-10-31`, 2);
		world.seedRun({ status: "lost", wavesCleared: 4 });
		world.seedRun({ status: "lost", wavesCleared: 2 });
		const { useCase } = build(world);

		const view = await useCase.run({ userId: USER, eventId: EVENT_ID, locale: "es", now: NOW });

		expect(view).toMatchObject({
			id: EVENT_ID,
			name: "Horda Zombie",
			open: true,
			attemptsPerDay: 3,
			attemptsLeftToday: 1,
			bestMark: 4,
			decks: [{ id: "necromancer", name: "Nigromante" }],
		});
		expect(view.waves).toEqual([
			{ wave: 1, tier: "easy", pool: ["Haunted", "Skeletons", "Horde"] },
			{ wave: 2, tier: "easy", pool: ["Haunted", "Skeletons", "Horde"] },
			{ wave: 3, tier: "medium", pool: ["Archfiends", "Vampires", "Witches"] },
			{ wave: 4, tier: "medium", pool: ["Archfiends", "Vampires", "Witches"] },
			{ wave: 5, tier: "hard", pool: ["DarkWorld", "CursedGarden", "Necromancer"] },
			{ wave: 6, tier: "hard", pool: ["DarkWorld", "CursedGarden", "Necromancer"] },
			{ wave: 7, tier: "miniboss", pool: ["Lich"] },
			{ wave: 8, tier: "boss", pool: ["Gravekeepers"] },
		]);
	});

	it("describes every prize cosmetic of a tier, in order, with its type, name and signed assets", async () => {
		const world = new World();
		withPrizes(world, [{ wavesCleared: 8, essence: 400, cosmeticIds: ["playmat-8", "sleeve-3"] }]);
		const { useCase } = build(world);

		const view = await useCase.run({ userId: USER, eventId: EVENT_ID, locale: "en", now: NOW });

		expect(view.prizeTiers).toEqual([
			{
				wavesCleared: 8,
				essence: 400,
				cosmeticIds: ["playmat-8", "sleeve-3"],
				cosmetics: [
					{
						id: "playmat-8",
						type: CosmeticType.PLAYMAT,
						name: "Graveyard",
						assets: { "background.webp": "https://signed/playmats/graveyard/background.webp" },
						assetsExpiresAt: EXPIRES_AT,
					},
					{
						id: "sleeve-3",
						type: CosmeticType.SLEEVE,
						name: "Pumpkin Sleeve",
						assets: { "render.jpg": "https://signed/sleeves/pumpkin/render.jpg" },
						assetsExpiresAt: EXPIRES_AT,
					},
				],
			},
		]);
	});

	it("skips a cosmetic missing from the catalog but keeps its id in cosmeticIds", async () => {
		const world = new World();
		withPrizes(world, [{ wavesCleared: 3, essence: 150, cosmeticIds: ["gone", "sleeve-3"] }]);
		const { useCase } = build(world);

		const view = await useCase.run({ userId: USER, eventId: EVENT_ID, locale: "en", now: NOW });

		expect(view.prizeTiers[0]?.cosmeticIds).toEqual(["gone", "sleeve-3"]);
		expect(view.prizeTiers[0]?.cosmetics.map((cosmetic) => cosmetic.id)).toEqual(["sleeve-3"]);
	});

	it("keeps the tiers' fields and answers no cosmetics for an essence-only tier", async () => {
		const world = new World();
		const { useCase } = build(world);

		const view = await useCase.run({ userId: USER, eventId: EVENT_ID, locale: "en", now: NOW });

		expect(view.prizeTiers.map(({ cosmetics: _, ...tier }) => tier)).toEqual(
			halloween().prizeTiers,
		);
		expect(view.prizeTiers.map((tier) => tier.cosmetics.length)).toEqual([1, 0, 0]);
	});

	it("looks each prize cosmetic up once even when several tiers grant it", async () => {
		const world = new World();
		withPrizes(world, [
			{ wavesCleared: 3, essence: 150, cosmeticIds: ["sleeve-3"] },
			{ wavesCleared: 8, essence: 400, cosmeticIds: ["sleeve-3", "playmat-8"] },
		]);
		const { useCase, lookups } = build(world);

		await useCase.run({ userId: USER, eventId: EVENT_ID, locale: "en", now: NOW });

		expect(lookups.sort()).toEqual(["playmat-8", "sleeve-3"]);
	});

	it("answers 404 for an unknown event", async () => {
		const world = new World();
		const { useCase } = build(world);

		await expect(
			useCase.run({ userId: USER, eventId: "nope", locale: "en", now: NOW }),
		).rejects.toThrow(NotFoundError);
	});
});
