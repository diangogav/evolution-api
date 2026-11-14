/** Where a cosmetic is used outside the catalog, for an administrator to see what it is for. */
export interface CosmeticUsage {
	/** Names of the bots that wear it. */
	readonly bots: readonly string[];
	/** The events that give it away as a prize. */
	readonly prizeOf: readonly { readonly eventId: string; readonly name: string }[];
}

/** Usage of every cosmetic that has any, keyed by cosmetic id. */
export interface CosmeticUsageSource {
	usage(): Promise<ReadonlyMap<string, CosmeticUsage>>;
}

export const NO_USAGE: CosmeticUsage = { bots: [], prizeOf: [] };
