import type { AccountFormat } from "./AccountFormats";

export interface AccountFormatsRepository {
	/** The user's chosen formats, null when they never chose, undefined when the user is unknown. */
	find(userId: string): Promise<AccountFormat[] | null | undefined>;
	/** Replaces the user's choice; false when the user is unknown. */
	save(userId: string, formats: readonly AccountFormat[]): Promise<boolean>;
}
