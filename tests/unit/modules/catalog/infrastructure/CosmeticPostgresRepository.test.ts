import { describe, expect, it, mock, spyOn } from "bun:test";

import { cosmeticsDataSource } from "../../../../../src/cosmetics-data-source";
import { Cosmetic } from "../../../../../src/modules/catalog/domain/Cosmetic";
import { CosmeticTier } from "../../../../../src/modules/catalog/domain/CosmeticTier";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";
import { CosmeticPostgresRepository } from "../../../../../src/modules/catalog/infrastructure/CosmeticPostgresRepository";

function stubRepository(fake: { findOne: ReturnType<typeof mock> }) {
	return spyOn(cosmeticsDataSource, "getRepository").mockReturnValue(fake as never);
}

describe("CosmeticPostgresRepository", () => {
	it("returns null for a non-uuid id without hitting the database", async () => {
		// The id column is uuid: Postgres throws `invalid input syntax for type uuid` if a
		// malformed id ever reaches the query, surfacing as a 500. The repository honors its
		// `Cosmetic | null` contract by short-circuiting before the column is ever queried.
		const findOne = mock(() => {
			throw new Error("findOne must not be called for a non-uuid id");
		});
		const spy = stubRepository({ findOne });

		const result = await new CosmeticPostgresRepository().findById("skeleton-mage");

		expect(result).toBeNull();
		expect(findOne).not.toHaveBeenCalled();

		spy.mockRestore();
	});

	it("maps the asset file index and carries no animation when loading by uuid", async () => {
		const assetFiles = ["surface.webp", "background.webp", "theme.json"];
		const id = "11111111-1111-4111-8111-111111111111";
		const findOne = mock(async () => ({
			id,
			type: CosmeticType.PLAYMAT,
			tier: CosmeticTier.STANDARD,
			assetRef: "playmats/kagura-castle/",
			displayName: "Castillo de Kagura",
			active: true,
			assetFiles,
		}));
		const spy = stubRepository({ findOne });

		const result = await new CosmeticPostgresRepository().findById(id);

		expect(result).toBeInstanceOf(Cosmetic);
		expect(result?.assetFiles).toEqual(assetFiles);
		expect(result).not.toHaveProperty("animation");

		spy.mockRestore();
	});
});
