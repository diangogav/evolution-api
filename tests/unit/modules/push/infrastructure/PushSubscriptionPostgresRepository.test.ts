import { describe, expect, it, mock } from "bun:test";

import { PushSubscriptionPostgresRepository } from "../../../../../src/modules/push/infrastructure/PushSubscriptionPostgresRepository";

const compact = (sql: string) => sql.replace(/\s+/g, " ").trim();

function managerReturning(...results: unknown[]) {
	const queue = [...results];
	return { query: mock(async (_sql: string, _params?: unknown[]) => queue.shift() ?? []) };
}

const subscription = {
	userId: "u-1",
	endpoint: "https://push.example.com/a",
	p256dh: "p256",
	auth: "auth",
	locale: "es" as const,
};

describe("PushSubscriptionPostgresRepository", () => {
	it("upserts by endpoint, moving the row to the caller and refreshing keys and locale", async () => {
		const manager = managerReturning();
		await new PushSubscriptionPostgresRepository(manager).upsert(subscription);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toBe(
			"INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, locale) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, locale = EXCLUDED.locale",
		);
		expect(params).toEqual(["u-1", "https://push.example.com/a", "p256", "auth", "es"]);
	});

	it("deletes the caller's own endpoint only", async () => {
		const manager = managerReturning();
		await new PushSubscriptionPostgresRepository(manager).deleteByEndpointForUser(
			"https://push.example.com/a",
			"u-1",
		);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toBe(
			"DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2",
		);
		expect(params).toEqual(["https://push.example.com/a", "u-1"]);
	});

	it("lists the subscriptions of several users in one query", async () => {
		const manager = managerReturning([
			{ user_id: "u-1", endpoint: "https://a", p256dh: "k1", auth: "a1", locale: "es" },
			{ user_id: "u-2", endpoint: "https://b", p256dh: "k2", auth: "a2", locale: "fr" },
		]);
		const rows = await new PushSubscriptionPostgresRepository(manager).listByUsers([
			"u-1",
			"u-2",
			"u-1",
		]);

		expect(manager.query).toHaveBeenCalledTimes(1);
		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toBe(
			"SELECT user_id, endpoint, p256dh, auth, locale FROM push_subscriptions WHERE user_id = ANY($1::varchar[]) ORDER BY user_id, created_at",
		);
		expect(params).toEqual([["u-1", "u-2"]]);
		expect(rows).toEqual([
			{ userId: "u-1", endpoint: "https://a", p256dh: "k1", auth: "a1", locale: "es" },
			{ userId: "u-2", endpoint: "https://b", p256dh: "k2", auth: "a2", locale: "en" },
		]);
	});

	it("skips the query when there is nobody to list or touch", async () => {
		const manager = managerReturning();
		const repository = new PushSubscriptionPostgresRepository(manager);

		expect(await repository.listByUsers([])).toEqual([]);
		await repository.touch([], new Date());

		expect(manager.query).not.toHaveBeenCalled();
	});

	it("deletes an endpoint whoever owns it", async () => {
		const manager = managerReturning();
		await new PushSubscriptionPostgresRepository(manager).deleteByEndpoint("https://a");

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toBe("DELETE FROM push_subscriptions WHERE endpoint = $1");
		expect(params).toEqual(["https://a"]);
	});

	it("stamps last_used_at on the delivered endpoints", async () => {
		const manager = managerReturning();
		const at = new Date("2026-11-11T20:00:00Z");
		await new PushSubscriptionPostgresRepository(manager).touch(["https://a", "https://b"], at);

		const [sql, params] = manager.query.mock.calls[0];
		expect(compact(sql)).toBe(
			"UPDATE push_subscriptions SET last_used_at = $2 WHERE endpoint = ANY($1::text[])",
		);
		expect(params).toEqual([["https://a", "https://b"], at]);
	});
});
