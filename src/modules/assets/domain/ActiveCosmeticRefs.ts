/**
 * In-memory set of the asset refs of active cosmetics: the ones whose files may be
 * served from public, cacheable URLs. Replaced as a whole on every reload so a ref
 * that stopped being active never lingers.
 */
export class ActiveCosmeticRefs {
	private refs: ReadonlySet<string> = new Set();

	has(assetRef: string): boolean {
		return this.refs.has(assetRef);
	}

	list(): string[] {
		return [...this.refs];
	}

	replace(assetRefs: Iterable<string>): void {
		this.refs = new Set(assetRefs);
	}
}
