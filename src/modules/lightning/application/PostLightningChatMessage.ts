import { ConflictError } from "../../../shared/errors/ConflictError";
import { ForbiddenError } from "../../../shared/errors/ForbiddenError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { TooManyRequestsError } from "../../../shared/errors/TooManyRequestsError";
import { Logger } from "../../../shared/logger/domain/Logger";
import { ChatRateLimiter } from "../domain/ChatRateLimiter";
import { newLightningChatMessage } from "../domain/LightningChatMessage";
import { LightningChatMessageRepository } from "../domain/LightningChatMessageRepository";
import { LightningChatMessageView, LightningChatPublisher } from "../domain/LightningChatPublisher";
import { LightningEntryRepository } from "../domain/LightningEntryRepository";
import { LightningTournamentRepository } from "../domain/LightningTournamentRepository";
import { PlayerDirectory } from "../domain/PlayerDirectory";
import { acceptsChat, chatAuthorsOf, toChatMessageView } from "./LightningChatViews";
import { UUID } from "./lockOpenTournament";

export type PostLightningChatMessageInput = {
	tournamentId: string;
	userId: string;
	/** The caller holds the admin role: admins write without an entry. */
	isAdmin: boolean;
	body: string;
};

/**
 * Stores a chat message, then fans it out. The body is validated before the rate limit is
 * consumed, so a rejected message does not cost the player quota. The publish runs after
 * the insert and its failure is only logged: the stored message reaches readers on their
 * next replay or history load.
 */
export class PostLightningChatMessage {
	constructor(
		private readonly tournaments: LightningTournamentRepository,
		private readonly entries: LightningEntryRepository,
		private readonly messages: LightningChatMessageRepository,
		private readonly rateLimiter: ChatRateLimiter,
		private readonly players: PlayerDirectory,
		private readonly publisher: LightningChatPublisher,
		private readonly logger: Pick<Logger, "error">,
	) {}

	async run(input: PostLightningChatMessageInput): Promise<LightningChatMessageView> {
		const notFound = () =>
			new NotFoundError(`Lightning tournament "${input.tournamentId}" not found`);
		if (!UUID.test(input.tournamentId)) throw notFound();
		const tournament = await this.tournaments.findById(input.tournamentId);
		if (!tournament) throw notFound();
		if (!acceptsChat(tournament.status)) {
			throw new ConflictError("The tournament chat is closed");
		}
		if (!input.isAdmin) {
			const entry = await this.entries.findOne(tournament.id, input.userId);
			if (!entry) throw new ForbiddenError("Only entrants can write in the tournament chat");
		}
		const message = newLightningChatMessage({
			tournamentId: tournament.id,
			userId: input.userId,
			body: input.body,
		});
		if (!(await this.rateLimiter.consume(tournament.id, input.userId))) {
			throw new TooManyRequestsError("Too many chat messages, slow down");
		}

		const stored = await this.messages.insert(message);
		const view = toChatMessageView(stored, await chatAuthorsOf(this.players, [stored]));
		try {
			await this.publisher.publish({ type: "message", message: view });
		} catch (error) {
			this.logger.error(
				`Lightning chat could not publish message ${stored.id}: ${errorMessage(error)}`,
			);
		}
		return view;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
