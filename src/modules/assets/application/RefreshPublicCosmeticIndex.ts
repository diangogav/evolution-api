import type { CatalogChangeNotifier } from "../../catalog/domain/CatalogChangeNotifier";
import type { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import type { Logger } from "../../../shared/logger/domain/Logger";
import type { ActiveCosmeticRefs } from "../domain/ActiveCosmeticRefs";
import type { PublicCosmeticIndexStore } from "../domain/PublicCosmeticIndexStore";

/**
 * Reloads the active cosmetic refs into memory and republishes the public index.
 * Best effort: a failure is logged and leaves the previous state in place, because
 * the fallback (signed URLs, or a CDN 404 for a ref missing from the index) is safe.
 */
export class RefreshPublicCosmeticIndex implements CatalogChangeNotifier {
	// Refreshes run one after another so an older catalog read never overwrites a
	// newer index.
	private queue: Promise<void> = Promise.resolve();

	constructor(
		private readonly cosmetics: Pick<CosmeticRepository, "findAll">,
		private readonly activeRefs: ActiveCosmeticRefs,
		private readonly index: PublicCosmeticIndexStore,
		private readonly logger: Logger,
	) {}

	run(): Promise<void> {
		this.queue = this.queue.then(() => this.refresh());
		return this.queue;
	}

	catalogChanged(): Promise<void> {
		return this.run();
	}

	private async refresh(): Promise<void> {
		try {
			const refs = (await this.cosmetics.findAll())
				.filter((cosmetic) => cosmetic.active)
				.map((cosmetic) => cosmetic.assetRef)
				.sort();
			this.activeRefs.replace(refs);
			await this.index.write(refs);
		} catch (error) {
			this.logger.error(
				new Error(`Public cosmetic index refresh failed: ${String(error)}`, { cause: error }),
			);
		}
	}
}
