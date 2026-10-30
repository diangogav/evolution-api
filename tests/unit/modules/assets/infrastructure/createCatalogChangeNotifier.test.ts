import { describe, expect, it } from "bun:test";

import { RefreshPublicCosmeticIndex } from "../../../../../src/modules/assets/application/RefreshPublicCosmeticIndex";
import { createCatalogChangeNotifier } from "../../../../../src/modules/assets/infrastructure/createCatalogChangeNotifier";
import type { Logger } from "../../../../../src/shared/logger/domain/Logger";

const logger: Logger = { debug: () => undefined, info: () => undefined, error: () => undefined };

describe("createCatalogChangeNotifier", () => {
	it("is a no-op that never reads the catalog when no public base URL is configured", async () => {
		let reads = 0;
		const notifier = createCatalogChangeNotifier(
			{
				findAll: async () => {
					reads++;
					return [];
				},
			},
			logger,
			undefined,
		);

		await notifier.catalogChanged();

		expect(notifier).not.toBeInstanceOf(RefreshPublicCosmeticIndex);
		expect(reads).toBe(0);
	});

	it("refreshes the public index when a public base URL is configured", () => {
		const notifier = createCatalogChangeNotifier(
			{ findAll: async () => [] },
			logger,
			"https://cdn.example.com/cosmetics",
		);

		expect(notifier).toBeInstanceOf(RefreshPublicCosmeticIndex);
	});
});
