/**
 * Told after the cosmetic catalog gained or changed rows, so derived state (such as
 * the public asset index) can be rebuilt. Implementations never throw.
 */
export interface CatalogChangeNotifier {
	catalogChanged(): Promise<void>;
}
