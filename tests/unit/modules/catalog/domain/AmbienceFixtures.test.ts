import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseAmbience } from "../../../../../src/modules/catalog/domain/Ambience";
import { STANDARD_COSMETICS } from "../../../../../src/modules/catalog/application/standardCosmetics";
import { CosmeticType } from "../../../../../src/modules/catalog/domain/CosmeticType";

const FIXTURES = join(import.meta.dir, "../../../../fixtures");

describe("standard ambience fixtures", () => {
	const skins = STANDARD_COSMETICS.filter((entry) => entry.type === CosmeticType.AMBIENCE);

	it("has a valid ambience.json for every seeded skin", () => {
		expect(skins).toHaveLength(4);
		for (const skin of skins) {
			const bytes = readFileSync(join(FIXTURES, skin.assetRef, "ambience.json"));

			expect(() => parseAmbience(bytes)).not.toThrow();
		}
	});
});
