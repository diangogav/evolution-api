import { LightningChatMessage } from "../domain/LightningChatMessage";
import { LightningChatMessageView } from "../domain/LightningChatPublisher";
import {
	LIVE_LIGHTNING_TOURNAMENT_STATUSES,
	LightningTournamentStatus,
} from "../domain/LightningTournament";
import { ChatAuthor, PlayerDirectory } from "../domain/PlayerDirectory";

/** A message an admin hid: readers drop it by id, its body and author stay private. */
export type DeletedLightningChatMessageView = { id: number; deleted: true };

export type LightningChatHistoryItem = LightningChatMessageView | DeletedLightningChatMessageView;

/** Writing is open while the tournament has entrants and is not over. */
export function acceptsChat(status: LightningTournamentStatus): boolean {
	return (LIVE_LIGHTNING_TOURNAMENT_STATUSES as readonly string[]).includes(status);
}

/** Resolves every author of the messages in one directory read. */
export async function chatAuthorsOf(
	players: PlayerDirectory,
	messages: Pick<LightningChatMessage, "userId">[],
): Promise<Map<string, ChatAuthor>> {
	const userIds = [...new Set(messages.map((message) => message.userId))];
	return players.authorsOf(userIds);
}

export function toChatMessageView(
	message: LightningChatMessage,
	authors: Map<string, ChatAuthor>,
): LightningChatMessageView {
	const author = authors.get(message.userId);
	return {
		id: message.id,
		tournamentId: message.tournamentId,
		author: {
			userId: message.userId,
			username: author?.username ?? "",
			admin: author?.admin ?? false,
		},
		body: message.body,
		createdAt: message.createdAt.toISOString(),
	};
}

export function toChatHistoryItem(
	message: LightningChatMessage,
	authors: Map<string, ChatAuthor>,
): LightningChatHistoryItem {
	if (message.deletedAt) return { id: message.id, deleted: true };
	return toChatMessageView(message, authors);
}
