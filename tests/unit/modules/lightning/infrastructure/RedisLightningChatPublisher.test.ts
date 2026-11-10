import { describe, expect, it, mock } from "bun:test";

import { LightningChatEvent } from "../../../../../src/modules/lightning/domain/LightningChatPublisher";
import { RedisLightningChatPublisher } from "../../../../../src/modules/lightning/infrastructure/RedisLightningChatPublisher";

const TOURNAMENT_ID = "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";

function setup() {
	const publish = mock(async (_channel: string, _message: string) => 1);
	return { publish, publisher: new RedisLightningChatPublisher({ publish }) };
}

describe("RedisLightningChatPublisher", () => {
	it("publishes a message event as JSON on the tournament channel", async () => {
		const { publish, publisher } = setup();
		const event: LightningChatEvent = {
			type: "message",
			message: {
				id: 7,
				tournamentId: TOURNAMENT_ID,
				author: { userId: "u-1", username: "alice", admin: false },
				body: "gl",
				createdAt: "2026-11-10T20:15:00.000Z",
			},
		};

		await publisher.publish(event);

		const [channel, payload] = publish.mock.calls[0];
		expect(channel).toBe(`lightning:chat:${TOURNAMENT_ID}`);
		expect(JSON.parse(payload)).toEqual(event);
	});

	it("publishes a deletion on the channel of its tournament", async () => {
		const { publish, publisher } = setup();

		await publisher.publish({ type: "deleted", tournamentId: TOURNAMENT_ID, id: 7 });

		expect(publish.mock.calls[0][0]).toBe(`lightning:chat:${TOURNAMENT_ID}`);
		expect(JSON.parse(publish.mock.calls[0][1])).toEqual({
			type: "deleted",
			tournamentId: TOURNAMENT_ID,
			id: 7,
		});
	});

	it("lets a Redis failure reach the caller", async () => {
		const publisher = new RedisLightningChatPublisher({
			publish: async () => {
				throw new Error("redis down");
			},
		});

		await expect(
			publisher.publish({ type: "deleted", tournamentId: TOURNAMENT_ID, id: 1 }),
		).rejects.toThrow("redis down");
	});
});
