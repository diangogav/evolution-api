import { UnprocessableError } from "../../../shared/errors/UnprocessableError";

/** Mirrors the CHECK on lightning_chat_messages.body, which counts code points. */
export const LIGHTNING_CHAT_BODY_MAX_LENGTH = 200;

const CONTROL_CHARACTER = /\p{Cc}/u;

/**
 * A persisted chat message. The id is the bigserial key as a number: it stays far below
 * Number.MAX_SAFE_INTEGER and doubles as the ordering cursor. A deleted message keeps its
 * row; deletedAt and deletedBy say an admin hid it.
 */
export type LightningChatMessage = {
	id: number;
	tournamentId: string;
	userId: string;
	body: string;
	createdAt: Date;
	deletedAt: Date | null;
	deletedBy: string | null;
};

/** A message ready to insert; the database assigns its id and createdAt. */
export type NewLightningChatMessage = Pick<
	LightningChatMessage,
	"tournamentId" | "userId" | "body"
>;

/** Validates a message body: one line of 1 to 200 characters after trimming. */
export function newLightningChatMessage(input: NewLightningChatMessage): NewLightningChatMessage {
	const body = input.body.trim();
	// Checked on the raw input too: trimming would silently drop a trailing newline.
	if (CONTROL_CHARACTER.test(input.body)) {
		throw new UnprocessableError("Chat messages cannot contain control characters");
	}
	const length = [...body].length;
	if (length === 0) throw new UnprocessableError("Chat message cannot be empty");
	if (length > LIGHTNING_CHAT_BODY_MAX_LENGTH) {
		throw new UnprocessableError(
			`Chat message cannot exceed ${LIGHTNING_CHAT_BODY_MAX_LENGTH} characters`,
		);
	}
	return { tournamentId: input.tournamentId, userId: input.userId, body };
}
