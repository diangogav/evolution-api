import { EmoteBar } from "./EmoteBar";

export interface EmoteBarRepository {
	/** The saved bar, or null when the user never saved one. */
	findByUserId(userId: string): Promise<EmoteBar | null>;

	/** Replaces the whole bar atomically. */
	save(userId: string, bar: EmoteBar): Promise<void>;
}
