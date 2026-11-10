import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { LightningChatMessageRepository } from "../domain/LightningChatMessageRepository";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { PlayerDirectory } from "../domain/PlayerDirectory";
import { chatAuthorsOf, LightningChatHistoryItem, toChatHistoryItem } from "./LightningChatViews";
import { UUID } from "./lockOpenTournament";

export const LIGHTNING_CHAT_PAGE_SIZE = 50;

export type GetLightningChatHistoryInput = {
	tournamentId: string;
	/** Messages with a lower id; null for the newest page. */
	before: number | null;
	limit?: number;
};

/** A page of the chat, oldest first; hidden messages come back as `{ id, deleted }`. */
export class GetLightningChatHistory {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly messages: LightningChatMessageRepository,
		private readonly players: PlayerDirectory,
	) {}

	async run(input: GetLightningChatHistoryInput): Promise<LightningChatHistoryItem[]> {
		const notFound = () =>
			new NotFoundError(`Lightning tournament "${input.tournamentId}" not found`);
		if (!UUID.test(input.tournamentId)) throw notFound();
		const tournament = await this.tournaments.findById(input.tournamentId);
		if (!tournament) throw notFound();

		const page = await this.messages.pageBefore(
			tournament.id,
			input.before,
			input.limit ?? LIGHTNING_CHAT_PAGE_SIZE,
		);
		const authors = await chatAuthorsOf(
			this.players,
			page.filter((message) => !message.deletedAt),
		);
		return page.map((message) => toChatHistoryItem(message, authors));
	}
}
