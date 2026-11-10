import { describe, expect, it, mock } from "bun:test";

import { LightningChatMessagePostgresRepository } from "../../../../../src/modules/lightning/infrastructure/LightningChatMessagePostgresRepository";

const compact = (sql: string) => sql.replace(/\s+/g, " ");

function managerReturning(...results: unknown[]) {
	const queue = [...results];
	return { query: mock(async (_sql: string, _params?: unknown[]) => queue.shift() ?? []) };
}

const at = (iso: string) => new Date(iso);

const row = (id: string, overrides: Record<string, unknown> = {}) => ({
	id,
	tournament_id: "t-1",
	user_id: "u-1",
	body: `message ${id}`,
	created_at: at("2026-11-10T20:00:00Z"),
	deleted_at: null,
	deleted_by: null,
	...overrides,
});

const message = (id: number, overrides: Record<string, unknown> = {}) => ({
	id,
	tournamentId: "t-1",
	userId: "u-1",
	body: `message ${id}`,
	createdAt: at("2026-11-10T20:00:00Z"),
	deletedAt: null,
	deletedBy: null,
	...overrides,
});

describe("LightningChatMessagePostgresRepository", () => {
	it("inserts a message and returns it with the id and time the database assigned", async () => {
		const manager = managerReturning([row("41", { body: "gl hf" })]);
		const repository = new LightningChatMessagePostgresRepository();

		const saved = await repository.insert(
			{ tournamentId: "t-1", userId: "u-1", body: "gl hf" },
			manager,
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain(
			"INSERT INTO lightning_chat_messages (tournament_id, user_id, body) VALUES ($1, $2, $3) RETURNING",
		);
		expect(params).toEqual(["t-1", "u-1", "gl hf"]);
		expect(saved).toEqual(message(41, { body: "gl hf" }));
	});

	it("reads a page of the newest messages, deleted ones included, oldest first", async () => {
		const deletedAt = at("2026-11-10T20:05:00Z");
		const manager = managerReturning([
			row("7"),
			row("8", { deleted_at: deletedAt, deleted_by: "admin-1" }),
		]);
		const repository = new LightningChatMessagePostgresRepository();

		const page = await repository.pageBefore("t-1", null, 50, manager);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain(
			"WHERE tournament_id = $1 AND ($2::bigint IS NULL OR id < $2::bigint)",
		);
		expect(compact(sql)).toContain("ORDER BY id DESC LIMIT $3");
		expect(compact(sql)).toMatch(/\) page ORDER BY id$/);
		expect(compact(sql)).not.toContain("deleted_at IS NULL");
		expect(params).toEqual(["t-1", null, 50]);
		expect(page).toEqual([message(7), message(8, { deletedAt, deletedBy: "admin-1" })]);
	});

	it("pages before a given message id", async () => {
		const manager = managerReturning([]);
		const repository = new LightningChatMessagePostgresRepository();

		await repository.pageBefore("t-1", 120, 50, manager);

		expect(manager.query.mock.calls[0][1]).toEqual(["t-1", 120, 50]);
	});

	it("lists the live messages after an id, capped and in id order", async () => {
		const manager = managerReturning([row("11"), row("12")]);
		const repository = new LightningChatMessagePostgresRepository();

		const replay = await repository.listAfter("t-1", 10, 200, manager);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain(
			"WHERE tournament_id = $1 AND id > $2 AND deleted_at IS NULL ORDER BY id LIMIT $3",
		);
		expect(params).toEqual(["t-1", 10, 200]);
		expect(replay).toEqual([message(11), message(12)]);
	});

	it("finds a message by id, or null when it does not exist", async () => {
		const manager = managerReturning([row("5")], []);
		const repository = new LightningChatMessagePostgresRepository();

		expect(await repository.findById(5, manager)).toEqual(message(5));
		expect(await repository.findById(6, manager)).toBeNull();
		expect(compact(manager.query.mock.calls[0][0])).toContain(
			"FROM lightning_chat_messages WHERE id = $1",
		);
	});

	it("soft deletes once and reports whether this call deleted the message", async () => {
		const manager = managerReturning([[{ id: "5" }], 1], [[], 0]);
		const repository = new LightningChatMessagePostgresRepository();

		const first = await repository.softDelete(5, "admin-1", manager);
		const second = await repository.softDelete(5, "admin-1", manager);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toContain(
			"UPDATE lightning_chat_messages SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id",
		);
		expect(params).toEqual([5, "admin-1"]);
		expect(first).toBe(true);
		expect(second).toBe(false);
	});
});
