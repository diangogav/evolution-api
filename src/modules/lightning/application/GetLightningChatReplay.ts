import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { LightningChatMessageRepository } from "../domain/LightningChatMessageRepository";
import { LightningChatMessageView } from "../domain/LightningChatPublisher";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { PlayerDirectory } from "../domain/PlayerDirectory";
import { chatAuthorsOf, toChatMessageView } from "./LightningChatViews";
import { UUID } from "./lockOpenTournament";

export const LIGHTNING_CHAT_REPLAY_CAP = 200;

export type GetLightningChatReplayInput = {
	tournamentId: string;
	/** The last message id the reader holds; null when it holds none and needs no replay. */
	afterId: number | null;
};

export type LightningChatReplay = {
	/** Non-deleted messages after `afterId`, oldest first, at most the cap. */
	messages: LightningChatMessageView[];
	/** More messages exist past the cap: the reader must reload the history instead. */
	truncated: boolean;
};

/**
 * What a reconnecting stream missed. It also answers NotFound for an unknown tournament,
 * so a stream can be refused before it opens.
 */
export class GetLightningChatReplay {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly messages: LightningChatMessageRepository,
		private readonly players: PlayerDirectory,
	) {}

	async run(input: GetLightningChatReplayInput): Promise<LightningChatReplay> {
		const notFound = () =>
			new NotFoundError(`Lightning tournament "${input.tournamentId}" not found`);
		if (!UUID.test(input.tournamentId)) throw notFound();
		const tournament = await this.tournaments.findById(input.tournamentId);
		if (!tournament) throw notFound();
		if (input.afterId === null) return { messages: [], truncated: false };

		// One row past the cap tells "exactly the cap" apart from "more than the cap".
		const rows = await this.messages.listAfter(
			tournament.id,
			input.afterId,
			LIGHTNING_CHAT_REPLAY_CAP + 1,
		);
		const kept = rows.slice(0, LIGHTNING_CHAT_REPLAY_CAP);
		const authors = await chatAuthorsOf(this.players, kept);
		return {
			messages: kept.map((message) => toChatMessageView(message, authors)),
			truncated: rows.length > LIGHTNING_CHAT_REPLAY_CAP,
		};
	}
}
