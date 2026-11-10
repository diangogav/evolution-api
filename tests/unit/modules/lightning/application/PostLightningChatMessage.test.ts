import { describe, expect, it } from "bun:test";

import { PostLightningChatMessage } from "../../../../../src/modules/lightning/application/PostLightningChatMessage";
import { LightningTournamentStatus } from "../../../../../src/modules/lightning/domain/LightningTournament";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { ForbiddenError } from "../../../../../src/shared/errors/ForbiddenError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { TooManyRequestsError } from "../../../../../src/shared/errors/TooManyRequestsError";
import { UnprocessableError } from "../../../../../src/shared/errors/UnprocessableError";
import { FakePublisher, FakeRateLimiter, InMemoryChatMessages, POSTED_AT } from "./chatFakes";
import { ADMIN, ALICE, BOB, logger, TOURNAMENT_ID, World } from "./fakes";

function setup(status: LightningTournamentStatus = "running") {
	const world = new World();
	world.seedTournament({ status });
	world.seedEntry(ALICE);
	const messages = new InMemoryChatMessages();
	const limiter = new FakeRateLimiter();
	const publisher = new FakePublisher();
	const log = logger();
	const post = new PostLightningChatMessage(
		world.tournamentRepository,
		world.entryRepository,
		messages,
		limiter,
		world.players,
		publisher,
		log,
	);
	return { world, messages, limiter, publisher, log, post };
}

const input = (overrides: Partial<Parameters<PostLightningChatMessage["run"]>[0]> = {}) => ({
	tournamentId: TOURNAMENT_ID,
	userId: ALICE,
	isAdmin: false,
	body: "  good luck all  ",
	...overrides,
});

describe("PostLightningChatMessage", () => {
	it("stores the trimmed message, publishes it and answers its view", async () => {
		const { messages, limiter, publisher, post } = setup();

		const view = await post.run(input());

		const expected = {
			id: 1,
			tournamentId: TOURNAMENT_ID,
			author: { userId: ALICE, username: "alice", admin: false },
			body: "good luck all",
			createdAt: POSTED_AT.toISOString(),
		};
		expect(view).toEqual(expected);
		expect(messages.rows).toHaveLength(1);
		expect(limiter.calls).toEqual([`${TOURNAMENT_ID}:${ALICE}`]);
		expect(publisher.events).toEqual([{ type: "message", message: expected }]);
	});

	it.each([
		"registration",
		"running",
		"finishing",
	] as const)("accepts messages while the tournament is %s", async (status) => {
		const { post } = setup(status);

		await expect(post.run(input())).resolves.toMatchObject({ body: "good luck all" });
	});

	it.each([
		"scheduled",
		"completed",
		"cancelled",
	] as const)("refuses messages while the tournament is %s", async (status) => {
		const { messages, post } = setup(status);

		await expect(post.run(input())).rejects.toThrow(ConflictError);
		expect(messages.rows).toEqual([]);
	});

	it("answers not found for an unknown or malformed tournament id", async () => {
		const { post } = setup();

		await expect(
			post.run(input({ tournamentId: "00000000-0000-4000-8000-000000000000" })),
		).rejects.toThrow(NotFoundError);
		await expect(post.run(input({ tournamentId: "nope" }))).rejects.toThrow(NotFoundError);
	});

	it("lets any entrant write, whatever the entry status", async () => {
		const { world, post } = setup();
		world.seedEntry(BOB, { status: "withdrawn" });

		await expect(post.run(input({ userId: BOB }))).resolves.toMatchObject({
			author: { userId: BOB, username: "bob" },
		});
	});

	it("forbids a player without an entry", async () => {
		const { limiter, post } = setup();

		await expect(post.run(input({ userId: BOB }))).rejects.toThrow(ForbiddenError);
		expect(limiter.calls).toEqual([]);
	});

	it("lets an admin write without an entry and flags the author as admin", async () => {
		const { post } = setup();

		const view = await post.run(input({ userId: ADMIN, isAdmin: true }));

		expect(view.author).toEqual({ userId: ADMIN, username: "admin", admin: true });
	});

	it("rejects an invalid body without consuming the rate limit", async () => {
		const { limiter, messages, post } = setup();

		await expect(post.run(input({ body: "   " }))).rejects.toThrow(UnprocessableError);
		await expect(post.run(input({ body: "x".repeat(201) }))).rejects.toThrow(UnprocessableError);
		expect(limiter.calls).toEqual([]);
		expect(messages.rows).toEqual([]);
	});

	it("answers too many requests when the rate limit refuses, storing nothing", async () => {
		const { limiter, messages, publisher, post } = setup();
		limiter.allow = false;

		await expect(post.run(input())).rejects.toThrow(TooManyRequestsError);
		expect(messages.rows).toEqual([]);
		expect(publisher.events).toEqual([]);
	});

	it("keeps the stored message and logs when the publish fails", async () => {
		const { messages, publisher, log, post } = setup();
		publisher.failure = new Error("redis down");

		const view = await post.run(input());

		expect(view.id).toBe(1);
		expect(messages.rows).toHaveLength(1);
		expect(log.error).toHaveBeenCalledTimes(1);
		expect(String(log.error.mock.calls[0][0])).toContain("redis down");
	});
});
