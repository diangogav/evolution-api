import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Logger } from "../../../shared/logger/domain/Logger";
import { LightningChatMessageRepository } from "../domain/LightningChatMessageRepository";
import { LightningChatPublisher } from "../domain/LightningChatPublisher";

export type DeleteLightningChatMessageInput = {
	tournamentId: string;
	messageId: number;
	adminUserId: string;
};

/**
 * Hides a message for every reader. Idempotent: deleting a hidden message succeeds without
 * a second event, and only the call that hid it publishes the `deleted` event.
 */
export class DeleteLightningChatMessage {
	constructor(
		private readonly messages: LightningChatMessageRepository,
		private readonly publisher: LightningChatPublisher,
		private readonly logger: Pick<Logger, "error">,
	) {}

	async run(input: DeleteLightningChatMessageInput): Promise<void> {
		const message = await this.messages.findById(input.messageId);
		if (!message || message.tournamentId !== input.tournamentId) {
			throw new NotFoundError(`Chat message ${input.messageId} not found`);
		}
		const deleted = await this.messages.softDelete(message.id, input.adminUserId);
		if (!deleted) return;
		try {
			await this.publisher.publish({
				type: "deleted",
				tournamentId: message.tournamentId,
				id: message.id,
			});
		} catch (error) {
			this.logger.error(
				`Lightning chat could not publish the deletion of ${message.id}: ${errorMessage(error)}`,
			);
		}
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
