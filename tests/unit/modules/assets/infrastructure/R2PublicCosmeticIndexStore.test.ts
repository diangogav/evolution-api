import { describe, expect, it } from "bun:test";

import { R2PublicCosmeticIndexStore } from "../../../../../src/modules/assets/infrastructure/R2PublicCosmeticIndexStore";

describe("R2PublicCosmeticIndexStore", () => {
	it("writes the sorted asset refs as a versioned JSON index outside the cosmetic prefixes", async () => {
		const writes: { key: string; body: string; options: unknown }[] = [];
		const store = new R2PublicCosmeticIndexStore({
			write: async (key: string, body: string, options?: unknown) => {
				writes.push({ key, body, options });
				return body.length;
			},
		});

		await store.write(["sleeves/zeta/", "avatars/alpha/"]);

		expect(writes).toHaveLength(1);
		expect(writes[0].key).toBe("_public/cosmetics-index.json");
		expect(JSON.parse(writes[0].body)).toEqual({
			version: 1,
			assetRefs: ["avatars/alpha/", "sleeves/zeta/"],
		});
		expect(writes[0].options).toEqual({ type: "application/json" });
	});
});
