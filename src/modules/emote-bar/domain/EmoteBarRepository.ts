import { EmoteBar } from "./EmoteBar";

export interface EmoteBarRepository {
	/**
	 * The stored refs exactly as saved, or null when the user never saved a bar or the stored
	 * array does not hold one ref per slot. Stored refs are not validated: they may predate
	 * the current rules, so the reader decides what each one means.
	 */
	findByUserId(userId: string): Promise<readonly string[] | null>;

	/** Replaces the whole bar atomically. */
	save(userId: string, bar: EmoteBar): Promise<void>;
}
