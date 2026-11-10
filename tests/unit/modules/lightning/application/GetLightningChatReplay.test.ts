import { describe, expect, it } from "bun:test";

import {
	GetLightningChatReplay,
	LIGHTNING_CHAT_REPLAY_CAP,
} from "../../../../../src/modules/lightning/application/GetLightningChatReplay";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { InMemoryChatMessages, POSTED_AT } from "./chatFakes";
import { ALICE, TOURNAMENT_ID, World } from "./fakes";

function setup() {
	const world = new World();
	world.seedTournament({ status: "running" });
	const messages = new InMemoryChatMessages();
	const replay = new GetLightningChatReplay(world.tournamentRepository, messages, world.players);
	return { messages, replay };
}

function seedMany(messages: InMemoryChatMessages, count: number) {
	for (let i = 0; i < count; i++) {
		messages.seed({ tournamentId: TOURNAMENT_ID, userId: ALICE, body: `m${i}` });
	}
}

describe("GetLightningChatReplay", () => {
	it("replays the visible messages after the cursor, oldest first", async () => {
		const { messages, replay } = setup();
		seedMany(messages, 3);
		messages.seed({
			tournamentId: TOURNAMENT_ID,
			userId: ALICE,
			body: "gone",
			deletedAt: POSTED_AT,
		});

		const result = await replay.run({ tournamentId: TOURNAMENT_ID, afterId: 1 });

		expect(result.truncated).toBe(false);
		expect(result.messages.map((m) => [m.id, m.body, m.author.username])).toEqual([
			[2, "m1", "alice"],
			[3, "m2", "alice"],
		]);
	});

	it("is not truncated when exactly the cap is missing", async () => {
		const { messages, replay } = setup();
		seedMany(messages, LIGHTNING_CHAT_REPLAY_CAP);

		const result = await replay.run({ tournamentId: TOURNAMENT_ID, afterId: 0 });

		expect(result.messages).toHaveLength(LIGHTNING_CHAT_REPLAY_CAP);
		expect(result.truncated).toBe(false);
	});

	it("stops at the cap and flags that the reader must reload the history", async () => {
		const { messages, replay } = setup();
		seedMany(messages, LIGHTNING_CHAT_REPLAY_CAP + 5);

		const result = await replay.run({ tournamentId: TOURNAMENT_ID, afterId: 0 });

		expect(result.messages).toHaveLength(LIGHTNING_CHAT_REPLAY_CAP);
		expect(result.messages[0].id).toBe(1);
		expect(result.truncated).toBe(true);
	});

	it("replays nothing for a reader without a cursor", async () => {
		const { messages, replay } = setup();
		seedMany(messages, 2);

		expect(await replay.run({ tournamentId: TOURNAMENT_ID, afterId: null })).toEqual({
			messages: [],
			truncated: false,
		});
	});

	it("answers not found for an unknown tournament, even without a cursor", async () => {
		const { replay } = setup();

		await expect(
			replay.run({ tournamentId: "9e14e45f-ceea-467a-9f0e-6b9e1c6a1a2b", afterId: null }),
		).rejects.toThrow(NotFoundError);
		await expect(replay.run({ tournamentId: "nope", afterId: 3 })).rejects.toThrow(NotFoundError);
	});
});
