import { describe, expect, it } from "bun:test";

import { ConfigureCompanionAnimation } from "../../../../../src/modules/catalog/application/ConfigureCompanionAnimation";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import type { CosmeticRepository } from "../../../../../src/modules/catalog/domain/CosmeticRepository";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { InvalidArgumentError } from "../../../../../src/shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";

function repositoryWith(cosmetic: Cosmetic | null) {
	let saved: Cosmetic | null = null;
	const repository: CosmeticRepository = {
		findAll: async () => (cosmetic ? [cosmetic] : []),
		findById: async () => cosmetic,
		save: async (next) => {
			saved = next;
		},
	};
	return { repository, saved: () => saved };
}

describe("ConfigureCompanionAnimation", () => {
	it("persists a motion profile for one companion", async () => {
		const companion = Cosmetic.create({
			id: "companion-1",
			type: CosmeticType.COMPANION,
			tier: CosmeticTier.EXCLUSIVE,
			assetRef: "companions/golden-dragon/",
			displayName: "Golden Dragon",
		});
		const fake = repositoryWith(companion);

		const result = await new ConfigureCompanionAnimation(fake.repository).run({
			cosmeticId: companion.id,
			animation: { motion: { preset: "serpentine", intensity: 0.75, speed: 0.8 } },
		});

		expect(result.animation?.motion?.preset).toBe("serpentine");
		expect(fake.saved()?.animation).toEqual(result.animation);
	});

	it("rejects a non-companion cosmetic", async () => {
		const playmat = Cosmetic.create({
			id: "playmat-1",
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.EXCLUSIVE,
			assetRef: "playmats/magma-forge/",
			displayName: "Magma Forge",
		});

		expect(
			new ConfigureCompanionAnimation(repositoryWith(playmat).repository).run({
				cosmeticId: playmat.id,
				animation: { motion: { preset: "grounded" } },
			}),
		).rejects.toBeInstanceOf(InvalidArgumentError);
	});

	it("rejects an unknown cosmetic", async () => {
		expect(
			new ConfigureCompanionAnimation(repositoryWith(null).repository).run({
				cosmeticId: "missing",
			}),
		).rejects.toBeInstanceOf(NotFoundError);
	});
});
