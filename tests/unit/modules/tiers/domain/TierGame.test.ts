import { describe, expect, it } from "bun:test";

import {
	BACKFILL_CUTOFF,
	BACKFILL_CUTOFF_MS,
	compareTierGames,
	gameTime,
	utcDay,
} from "../../../../../src/modules/tiers/domain/TierGame";
import { edisonBackfillBurst, tierGame } from "../fixtures/season7Slices";

const ids = (games: { gameId: string }[]) => games.map((game) => game.gameId);

describe("BACKFILL_CUTOFF", () => {
	it("is the UTC midnight that ends the 2026-09-09 bulk backfill, in both representations", () => {
		expect(BACKFILL_CUTOFF).toBe("2026-09-10 00:00:00");
		expect(BACKFILL_CUTOFF_MS).toBe(Date.UTC(2026, 8, 10));
		expect(Date.parse(`${BACKFILL_CUTOFF.replace(" ", "T")}Z`)).toBe(BACKFILL_CUTOFF_MS);
	});
});

describe("gameTime", () => {
	it("uses the duel time for a row written before the cutoff", () => {
		const game = tierGame({ appliedAt: BACKFILL_CUTOFF_MS - 1, duelAt: Date.UTC(2026, 8, 1) });

		expect(gameTime(game)).toBe(Date.UTC(2026, 8, 1));
	});

	it("falls back to the applied time when a pre-cutoff row has no duel", () => {
		const game = tierGame({ appliedAt: BACKFILL_CUTOFF_MS - 1, duelAt: null });

		expect(gameTime(game)).toBe(BACKFILL_CUTOFF_MS - 1);
	});

	it("ignores the duel time from the cutoff onwards", () => {
		const atCutoff = tierGame({ appliedAt: BACKFILL_CUTOFF_MS, duelAt: Date.UTC(2026, 8, 1) });
		const later = tierGame({ appliedAt: Date.UTC(2026, 8, 15), duelAt: Date.UTC(2026, 8, 1) });

		expect(gameTime(atCutoff)).toBe(BACKFILL_CUTOFF_MS);
		expect(gameTime(later)).toBe(Date.UTC(2026, 8, 15));
	});
});

describe("compareTierGames", () => {
	it("replays the backfill burst in duel order, which reverses the ledger order", () => {
		expect(ids(edisonBackfillBurst)).toEqual(["g1", "g2", "g3", "g4"]);

		expect(ids([...edisonBackfillBurst].sort(compareTierGames))).toEqual(["g4", "g3", "g2", "g1"]);
	});

	it("falls back to applied time and then applied id when the burst has no duel rows", () => {
		const withoutDuels = edisonBackfillBurst.map((game) => ({ ...game, duelAt: null }));

		expect(ids([...withoutDuels].reverse().sort(compareTierGames))).toEqual([
			"g1",
			"g2",
			"g3",
			"g4",
		]);
	});

	it("breaks a game-time tie by applied time before applied id", () => {
		const first = tierGame({
			gameId: "early",
			appliedId: "z",
			appliedAt: Date.UTC(2026, 8, 15, 10),
		});
		const second = tierGame({
			gameId: "late",
			appliedId: "a",
			appliedAt: Date.UTC(2026, 8, 15, 11),
		});
		const pinned = { appliedAt: BACKFILL_CUTOFF_MS - 1, duelAt: Date.UTC(2026, 8, 1) };

		expect(ids([second, first].sort(compareTierGames))).toEqual(["early", "late"]);
		expect(
			ids(
				[
					tierGame({ ...pinned, gameId: "b", appliedId: "b" }),
					tierGame({ ...pinned, gameId: "a", appliedId: "a" }),
				].sort(compareTierGames),
			),
		).toEqual(["a", "b"]);
	});

	it("breaks a full tie by applied id the way Postgres orders the ledger uuids", () => {
		const pinned = { appliedAt: Date.UTC(2026, 8, 15, 10), duelAt: null };
		const ids = [
			"f3b9c2a1-7d4e-4c0b-9a6f-1e2d3c4b5a60",
			"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
			"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4e",
			"9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f",
		];
		const games = ids.map((appliedId) => tierGame({ ...pinned, gameId: appliedId, appliedId }));

		expect(games.sort(compareTierGames).map((game) => game.appliedId)).toEqual([
			"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
			"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4e",
			"9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f",
			"f3b9c2a1-7d4e-4c0b-9a6f-1e2d3c4b5a60",
		]);
	});
});

describe("utcDay", () => {
	it("keeps a minute before midnight and a minute after on different UTC days", () => {
		expect(utcDay(Date.UTC(2026, 8, 9, 23, 59))).toBe("2026-09-09");
		expect(utcDay(Date.UTC(2026, 8, 10, 0, 1))).toBe("2026-09-10");
	});

	it("derives the day from the game time, so a backfilled row lands on its duel day", () => {
		const game = tierGame({
			appliedAt: Date.UTC(2026, 8, 9, 19, 21),
			duelAt: Date.UTC(2026, 8, 3, 2),
		});

		expect(utcDay(gameTime(game))).toBe("2026-09-03");
	});
});
