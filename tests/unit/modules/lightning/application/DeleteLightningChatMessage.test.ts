import { describe, expect, it } from "bun:test";

import { DeleteLightningChatMessage } from "../../../../../src/modules/lightning/application/DeleteLightningChatMessage";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { FakePublisher, InMemoryChatMessages } from "./chatFakes";
import { ADMIN, ALICE, logger, TOURNAMENT_ID } from "./fakes";

const OTHER_TOURNAMENT = "9e14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";

function setup() {
	const messages = new InMemoryChatMessages();
	const publisher = new FakePublisher();
	const log = logger();
	const remove = new DeleteLightningChatMessage(messages, publisher, log);
	const message = messages.seed({ tournamentId: TOURNAMENT_ID, userId: ALICE, body: "rude" });
	return { messages, publisher, log, remove, message };
}

describe("DeleteLightningChatMessage", () => {
	it("hides the message and publishes its deletion", async () => {
		const { messages, publisher, remove, message } = setup();

		await remove.run({ tournamentId: TOURNAMENT_ID, messageId: message.id, adminUserId: ADMIN });

		expect(messages.rows[0]).toMatchObject({ deletedBy: ADMIN });
		expect(publisher.events).toEqual([
			{ type: "deleted", tournamentId: TOURNAMENT_ID, id: message.id },
		]);
	});

	it("succeeds again on a hidden message without publishing a second event", async () => {
		const { publisher, remove, message } = setup();
		const input = { tournamentId: TOURNAMENT_ID, messageId: message.id, adminUserId: ADMIN };

		await remove.run(input);
		await remove.run(input);

		expect(publisher.events).toHaveLength(1);
	});

	it("answers not found for a missing message or one of another tournament", async () => {
		const { messages, publisher, remove, message } = setup();

		await expect(
			remove.run({ tournamentId: TOURNAMENT_ID, messageId: 999, adminUserId: ADMIN }),
		).rejects.toThrow(NotFoundError);
		await expect(
			remove.run({ tournamentId: OTHER_TOURNAMENT, messageId: message.id, adminUserId: ADMIN }),
		).rejects.toThrow(NotFoundError);
		expect(messages.rows[0].deletedAt).toBeNull();
		expect(publisher.events).toEqual([]);
	});

	it("keeps the deletion and logs when the publish fails", async () => {
		const { messages, publisher, log, remove, message } = setup();
		publisher.failure = new Error("redis down");

		await remove.run({ tournamentId: TOURNAMENT_ID, messageId: message.id, adminUserId: ADMIN });

		expect(messages.rows[0].deletedAt).not.toBeNull();
		expect(log.error).toHaveBeenCalledTimes(1);
	});
});
