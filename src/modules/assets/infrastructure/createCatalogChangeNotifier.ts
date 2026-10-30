import { config } from "../../../config";
import type { CatalogChangeNotifier } from "../../catalog/domain/CatalogChangeNotifier";
import type { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import type { Logger } from "../../../shared/logger/domain/Logger";
import { RefreshPublicCosmeticIndex } from "../application/RefreshPublicCosmeticIndex";
import { activeCosmeticRefs } from "./activeCosmeticRefs";
import { createR2Client } from "./createR2Client";
import { R2PublicCosmeticIndexStore } from "./R2PublicCosmeticIndexStore";

const NO_OP: CatalogChangeNotifier = { catalogChanged: async () => undefined };

// One refresher per process: boot and publish share its queue, so their index writes
// never interleave. The first caller's dependencies are kept.
let shared: RefreshPublicCosmeticIndex | undefined;

/**
 * Rebuilds the active set and the public index on catalog changes, only when public
 * cosmetic URLs are configured; otherwise nothing is public and nothing is written.
 */
export function createCatalogChangeNotifier(
	cosmetics: Pick<CosmeticRepository, "findAll">,
	logger: Logger,
	publicBaseUrl: string | undefined = config.cosmeticsPublicBaseUrl,
): CatalogChangeNotifier {
	if (!publicBaseUrl) {
		return NO_OP;
	}

	shared ??= new RefreshPublicCosmeticIndex(
		cosmetics,
		activeCosmeticRefs,
		new R2PublicCosmeticIndexStore(createR2Client()),
		logger,
	);
	return shared;
}
