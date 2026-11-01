import { describe, expect, it } from "bun:test";
import {
	PlayerReportPostgresRepository,
	type ReportDatabase,
} from "../../../../../src/modules/player-reports/infrastructure/PlayerReportPostgresRepository";
import type { QueryableManager } from "../../../../../src/shared/persistence/QueryableManager";
import type {
	SubmitReportInput,
	ReportStatus,
} from "../../../../../src/modules/player-reports/domain/PlayerReport";

const now = new Date("2026-10-31T12:00:00Z");
const input = (gameId = "game"): SubmitReportInput => ({
	reporterId: "a",
	reportedUserId: "b",
	gameId,
	reason: "stalling",
	details: "Opponent repeatedly stalled.",
	now,
});
type Row = {
	id: string;
	reporterId: string;
	reportedUserId: string;
	gameId: string;
	reason: string;
	details: string;
	context: unknown;
	status: ReportStatus;
	revision: number;
	createdAt: Date;
	updatedAt: Date;
};
class Database implements ReportDatabase {
	rows: Row[] = [];
	reviews: unknown[][] = [];
	queries: string[] = [];
	matchBounds: unknown[][] = [];
	eligible = true;
	failAudit = false;
	private locks = new Map<string, Promise<void>>();
	async query(sql: string, args: unknown[] = []): Promise<unknown> {
		this.queries.push(sql);
		if (sql.includes("FROM matches")) {
			this.matchBounds.push(args.slice(1, 3));
			expect(sql).toContain("m.user_id=$1");
			expect(sql).toContain("m.deleted_at IS NULL");
			expect(sql).toContain("$1=ANY(string_to_array(m.player_ids");
			expect(sql).toContain("m.date >= $2::timestamp AND m.date <= $3::timestamp");
			expect(sql).toContain("m.date AT TIME ZONE 'UTC' AS date");
			expect(typeof args[1]).toBe("string");
			expect(typeof args[2]).toBe("string");
			if (!this.eligible) return [];
			if (sql.includes("JOIN LATERAL"))
				return [
					{
						gameId: "game",
						date: now,
						banListName: "TCG",
						playerScore: 1,
						opponentScore: 2,
						opponents: [{ userId: "b", username: "Opponent" }],
					},
				];
			expect(sql).toContain("$5=ANY(string_to_array(m.opponent_ids");
			return [
				{
					id: "match",
					game_id: args[3],
					date: now,
					ban_list_name: "TCG",
					best_of: 3,
					player_score: 1,
					opponent_score: 2,
					player_ids: "a",
					opponent_ids: "b",
					player_names: "Old reporter name",
					opponent_names: "Old opponent name",
					reporter_username: "Reporter",
					reported_username: "Opponent",
				},
			];
		}
		if (sql.startsWith("SELECT COUNT"))
			return [
				{
					count: this.rows.filter(
						(row) => row.reporterId === args[0] && row.createdAt > (args[1] as Date),
					).length,
				},
			];
		if (sql.startsWith("SELECT") && sql.includes("FROM player_reports"))
			return this.rows
				.filter((row) =>
					sql.includes("reporter_id=$1 AND game_id=$2")
						? row.reporterId === args[0] && row.gameId === args[1] && row.reportedUserId === args[2]
						: row.id === args[0],
				)
				.map((row) => ({ ...row }));
		if (sql.startsWith("INSERT INTO player_reports")) {
			const row: Row = {
				id: crypto.randomUUID(),
				reporterId: args[0] as string,
				reportedUserId: args[1] as string,
				gameId: args[2] as string,
				reason: args[3] as string,
				details: args[4] as string,
				context: JSON.parse(args[5] as string),
				status: "open",
				revision: 1,
				createdAt: args[6] as Date,
				updatedAt: args[6] as Date,
			};
			this.rows.push(row);
			return [row];
		}
		if (sql.startsWith("UPDATE player_reports")) {
			const row = this.rows.find((item) => item.id === args[0]);
			if (!row) throw Error("fixture row missing");
			row.status = args[1] as ReportStatus;
			row.updatedAt = args[2] as Date;
			row.revision++;
			return [{ ...row }];
		}
		if (sql.startsWith("INSERT INTO player_report_reviews")) {
			if (this.failAudit) throw Error("audit unavailable");
			this.reviews.push(args);
			return [];
		}
		throw Error("Unexpected query: " + sql);
	}
	async transaction<T>(work: (manager: QueryableManager) => Promise<T>): Promise<T> {
		let release: (() => void) | undefined;
		const tx: QueryableManager = {
			query: async (sql, args = []) => {
				if (sql.includes("pg_advisory_xact_lock") || sql.endsWith("FOR UPDATE")) {
					const key = String(args[0]);
					const previous = this.locks.get(key) ?? Promise.resolve();
					const current = new Promise<void>((resolve) => {
						release = resolve;
					});
					this.locks.set(key, current);
					await previous;
					if (sql.includes("pg_advisory_xact_lock")) {
						this.queries.push(sql);
						return [];
					}
				}
				return this.query(sql, args);
			},
		};
		try {
			return await work(tx);
		} finally {
			release?.();
		}
	}
}
describe("PlayerReportPostgresRepository", () => {
	it("uses UTC wall-clock bounds for both listing and immutable evidence", async () => {
		const db = new Database();
		const repository = new PlayerReportPostgresRepository(db);
		const offsetNow = new Date("2026-11-01T00:30:00+05:30");
		await repository.listMatches({ reporterId: "a", page: 1, limit: 20, now: offsetNow });
		await repository.submit({ ...input(), now: offsetNow });
		expect(db.matchBounds).toEqual([
			["2026-10-01 19:00:00.000", "2026-10-31 19:00:00.000"],
			["2026-10-01 19:00:00.000", "2026-10-31 19:00:00.000"],
		]);
		expect(db.rows[0].context).toMatchObject({ date: now.toISOString() });
	});
	it("serializes simultaneous reports under the actual per-reporter lock path", async () => {
		const db = new Database();
		const repository = new PlayerReportPostgresRepository(db);
		const results = await Promise.all(
			Array.from({ length: 12 }, (_, index) => repository.submit(input("game-" + index))),
		);
		expect(results.filter((row) => row.outcome === "accepted")).toHaveLength(5);
		expect(results.filter((row) => row.outcome === "quota")).toHaveLength(7);
		expect(db.rows).toHaveLength(5);
		expect(db.queries[0]).toContain("pg_advisory_xact_lock");
	});
	it("replays duplicate requests without replacing evidence, even at the quota", async () => {
		const db = new Database();
		const repository = new PlayerReportPostgresRepository(db);
		const results = await Promise.all(Array.from({ length: 8 }, () => repository.submit(input())));
		expect(db.rows).toHaveLength(1);
		expect(
			new Set(results.map((result) => (result.outcome === "accepted" ? result.receipt.id : "")))
				.size,
		).toBe(1);
		for (let i = 0; i < 4; i++) await repository.submit(input("other-" + i));
		db.eligible = false;
		expect((await repository.submit({ ...input(), details: "Different allegation" })).outcome).toBe(
			"accepted",
		);
		expect(db.rows[0].details).toBe(input().details);
		expect(db.rows).toHaveLength(5);
	});
	it("rejects unsupported match identities and snapshots only server-read context", async () => {
		const db = new Database();
		const repository = new PlayerReportPostgresRepository(db);
		db.eligible = false;
		expect((await repository.submit(input())).outcome).toBe("ineligible");
		expect(db.rows).toHaveLength(0);
		db.eligible = true;
		await repository.submit(input());
		expect(db.rows[0].context).toEqual({
			matchId: "match",
			gameId: "game",
			date: now.toISOString(),
			banListName: "TCG",
			bestOf: 3,
			playerScore: 1,
			opponentScore: 2,
			playerIds: ["a"],
			opponentIds: ["b"],
			playerNames: ["Old reporter name"],
			opponentNames: ["Old opponent name"],
			reporterUsername: "Reporter",
			reportedUsername: "Opponent",
		});
		const matches = await repository.listMatches({ reporterId: "a", page: 1, limit: 20, now });
		expect(matches[0].opponents[0].userId).toBe("b");
	});
	it("counts a rolling 24 hours and accepts reports once earlier submissions expire", async () => {
		const db = new Database();
		const repository = new PlayerReportPostgresRepository(db);
		for (let i = 0; i < 5; i++) await repository.submit(input("old-" + i));
		expect((await repository.submit(input("blocked"))).outcome).toBe("quota");
		expect(
			(await repository.submit({ ...input("new"), now: new Date(now.getTime() + 86400001) }))
				.outcome,
		).toBe("accepted");
	});
	it("locks admin reviews, rejects a stale revision, and appends the authenticated audit", async () => {
		const db = new Database();
		const repository = new PlayerReportPostgresRepository(db);
		await repository.submit(input());
		const value = {
			id: db.rows[0].id,
			adminUserId: "admin-a",
			status: "investigating" as const,
			note: "Reviewing server logs",
			expectedRevision: 1,
			now,
		};
		const results = await Promise.all([
			repository.review(value),
			repository.review({ ...value, adminUserId: "admin-b" }),
		]);
		expect(results.map((result) => result.outcome).sort()).toEqual(["accepted", "conflict"]);
		expect(db.reviews).toHaveLength(1);
		expect(db.reviews[0].slice(1, 6)).toEqual([
			"admin-a",
			"open",
			"investigating",
			"Reviewing server logs",
			2,
		]);
		expect(db.rows[0].details).toBe(input().details);
	});
});
