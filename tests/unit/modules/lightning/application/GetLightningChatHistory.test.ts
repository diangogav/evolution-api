import { describe, expect, it } from "bun:test";

import { GetLightningChatHistory } from "../../../../../src/modules/lightning/application/GetLightningChatHistory";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { InMemoryChatMessages, POSTED_AT } from "./chatFakes";
import { ADMIN, ALICE, BOB, TOURNAMENT_ID, World } from "./fakes";

const OTHER_TOURNAMENT = "9e14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";

function setup() {
	const world = new World();
	world.seedTournament({ status: "running" });
	const messages = new InMemoryChatMessages();
	const authorLookups: string[][] = [];
	const players = {
		...world.players,
		authorsOf: async (ids: string[]) => {
			authorLookups.push(ids);
			return world.players.authorsOf(ids);
		},
	};
	const history = new GetLightningChatHistory(world.tournamentRepository, messages, players);
	return { messages, authorLookups, history };
}

describe("GetLightningChatHistory", () => {
	it("answers the newest page oldest first with authors resolved in one lookup", async () => {
		const { messages, authorLookups, history } = setup();
		messages.seed({ tournamentId: TOURNAMENT_ID, userId: ALICE, body: "hi" });
		messages.seed({ tournamentId: TOURNAMENT_ID, userId: ADMIN, body: "welcome" });
		messages.seed({ tournamentId: TOURNAMENT_ID, userId: ALICE, body: "thanks" });
		messages.seed({ tournamentId: OTHER_TOURNAMENT, userId: BOB, body: "elsewhere" });

		const page = await history.run({ tournamentId: TOURNAMENT_ID, before: null });

		expect(page).toEqual([
			{
				id: 1,
				tournamentId: TOURNAMENT_ID,
				author: { userId: ALICE, username: "alice", admin: false },
				body: "hi",
				createdAt: POSTED_AT.toISOString(),
			},
			{
				id: 2,
				tournamentId: TOURNAMENT_ID,
				author: { userId: ADMIN, username: "admin", admin: true },
				body: "welcome",
				createdAt: POSTED_AT.toISOString(),
			},
			{
				id: 3,
				tournamentId: TOURNAMENT_ID,
				author: { userId: ALICE, username: "alice", admin: false },
				body: "thanks",
				createdAt: POSTED_AT.toISOString(),
			},
		]);
		expect(authorLookups).toEqual([[ALICE, ADMIN]]);
	});

	it("pages before a cursor and honours the limit", async () => {
		const { messages, history } = setup();
		for (let i = 0; i < 5; i++) {
			messages.seed({ tournamentId: TOURNAMENT_ID, userId: ALICE, body: `m${i}` });
		}

		const page = await history.run({ tournamentId: TOURNAMENT_ID, before: 5, limit: 2 });

		expect(page.map((item) => item.id)).toEqual([3, 4]);
	});

	it("returns hidden messages as bare deleted markers without body or author", async () => {
		const { messages, authorLookups, history } = setup();
		messages.seed({ tournamentId: TOURNAMENT_ID, userId: BOB, body: "rude", deletedAt: POSTED_AT });
		messages.seed({ tournamentId: TOURNAMENT_ID, userId: ALICE, body: "ok" });

		const page = await history.run({ tournamentId: TOURNAMENT_ID, before: null });

		expect(page[0]).toEqual({ id: 1, deleted: true });
		expect(page[1]).toMatchObject({ id: 2, body: "ok" });
		expect(authorLookups).toEqual([[ALICE]]);
	});

	it("answers not found for an unknown or malformed tournament id", async () => {
		const { history } = setup();

		await expect(history.run({ tournamentId: OTHER_TOURNAMENT, before: null })).rejects.toThrow(
			NotFoundError,
		);
		await expect(history.run({ tournamentId: "nope", before: null })).rejects.toThrow(
			NotFoundError,
		);
	});
});
