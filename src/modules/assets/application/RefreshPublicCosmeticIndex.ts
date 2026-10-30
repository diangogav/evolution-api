import type { CatalogChangeNotifier } from "../../catalog/domain/CatalogChangeNotifier";
import type { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import type { Logger } from "../../../shared/logger/domain/Logger";
import type { ActiveCosmeticRefs } from "../domain/ActiveCosmeticRefs";
import type { PublicCosmeticIndexStore } from "../domain/PublicCosmeticIndexStore";

/**
 * How long a CDN isolate may keep serving an index it already read: a ref turns
 * public in the API only once every isolate can have read the new index.
 */
const CDN_INDEX_PROPAGATION_MS = 65_000;

/**
 * Reloads the active cosmetic refs and republishes the public index. The index is
 * written first; the API keeps signing a newly active ref until the CDN can have
 * read that index, so no player gets a public URL the CDN still answers with 404.
 * A ref no longer active stops being public at once. Best effort: a failure is
 * logged and leaves the previous state in place, because signed URLs keep working.
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
		private readonly options: { readonly wait?: (ms: number) => Promise<void> } = {},
	) {}

	run(): Promise<void> {
		this.queue = this.queue.then(() => this.refresh());
		return this.queue;
	}

	private wait(ms: number): Promise<void> {
		return this.options.wait
			? this.options.wait(ms)
			: new Promise((resolve) => setTimeout(resolve, ms));
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
			await this.index.write(refs);
			const next = new Set(refs);
			this.activeRefs.replace(this.activeRefs.list().filter((ref) => next.has(ref)));
			await this.wait(CDN_INDEX_PROPAGATION_MS);
			this.activeRefs.replace(refs);
		} catch (error) {
			this.logger.error(
				new Error(`Public cosmetic index refresh failed: ${String(error)}`, { cause: error }),
			);
		}
	}
}
