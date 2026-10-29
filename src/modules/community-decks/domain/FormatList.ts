// One section of an lflist file. A whitelist allows only the cards it lists; any other list
// forbids or limits the cards it lists and allows every other card at three copies.
export type FormatList = {
	/** The section header (`!2010.3 Edison` → "2010.3 Edison"), stored as the deck's format. */
	label: string;
	whitelist: boolean;
	limits: ReadonlyMap<number, number>;
};

export const MAX_COPIES = 3;
