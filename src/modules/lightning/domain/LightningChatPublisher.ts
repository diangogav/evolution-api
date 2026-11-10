/** A chat message as players see it; the author's name and role are read at view time. */
export type LightningChatMessageView = {
	id: number;
	tournamentId: string;
	author: { userId: string; username: string; admin: boolean };
	body: string;
	createdAt: string;
};

export type LightningChatEvent =
	| { type: "message"; message: LightningChatMessageView }
	| { type: "deleted"; tournamentId: string; id: number };

/**
 * Pushes chat events to every API instance holding a stream of the tournament. Delivery is
 * best effort: the table stays the source of truth and readers recover a lost event on
 * their next replay or history load.
 */
export interface LightningChatPublisher {
	publish(event: LightningChatEvent): Promise<void>;
}
