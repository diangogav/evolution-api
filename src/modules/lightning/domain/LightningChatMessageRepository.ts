import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { LightningChatMessage, NewLightningChatMessage } from "./LightningChatMessage";

export interface LightningChatMessageRepository {
	insert(
		message: NewLightningChatMessage,
		manager?: QueryableManager,
	): Promise<LightningChatMessage>;
	/**
	 * The newest `limit` messages with an id below `beforeId` (or the newest overall when
	 * null), oldest first. Deleted messages are included so readers can drop them.
	 */
	pageBefore(
		tournamentId: string,
		beforeId: number | null,
		limit: number,
		manager?: QueryableManager,
	): Promise<LightningChatMessage[]>;
	/** Up to `cap` non-deleted messages with an id above `afterId`, oldest first. */
	listAfter(
		tournamentId: string,
		afterId: number,
		cap: number,
		manager?: QueryableManager,
	): Promise<LightningChatMessage[]>;
	findById(id: number, manager?: QueryableManager): Promise<LightningChatMessage | null>;
	/** Hides a message. Idempotent: true only for the call that deleted it. */
	softDelete(id: number, adminUserId: string, manager?: QueryableManager): Promise<boolean>;
}
