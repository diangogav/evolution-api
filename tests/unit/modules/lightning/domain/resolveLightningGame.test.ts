import { describe, expect, it } from "bun:test";

import type { ReservedDuelRecord } from "../../../../../src/modules/reserved-duel";
import {
	outcomeOfResolvedGame,
	outcomeForSeat,
	noShowSeatsOf,
	resolveLightningGame,
	UNCLAIMED_RESERVATION_MS,
} from "../../../../../src/modules/lightning/domain/resolveLightningGame";

const issuedAt = new Date("2026-11-10T20:00:00Z");
const now = new Date("2026-11-10T20:10:00Z");
const STALE_MS = 45 * 60 * 1000;

function record(overrides: Partial<ReservedDuelRecord> = {}): ReservedDuelRecord {
	return {
		reservationId: "AbCdEfGh12345678",
		roomId: 12,
		joinedAt: issuedAt,
		startedAt: issuedAt,
		endedAt: now,
		outcome: "decided",
		winnerSeat: 0,
		abandonedBySeat: null,
		reason: "win",
		...overrides,
	};
}

const resolve = (
	rec: ReservedDuelRecord | null,
	at = now,
	options: { staleAfterMs?: number } = {},
) => resolveLightningGame({ issuedAt }, rec, at, options.staleAfterMs ?? STALE_MS);

describe("resolveLightningGame", () => {
	it("a decided duel is a win for the winner's seat", () => {
		expect(resolve(record({ winnerSeat: 0 }))).toEqual({
			resolution: "seat0_win",
			reason: "win",
			noShowSeats: [],
			stale: false,
			unclaimed: false,
		});
		expect(resolve(record({ winnerSeat: 1 }))?.resolution).toBe("seat1_win");
	});

	it("a draw is a draw", () => {
		expect(resolve(record({ outcome: "draw", winnerSeat: null, reason: null }))).toMatchObject({
			resolution: "draw",
			reason: "draw",
		});
	});

	it("leaving after the duel started loses it", () => {
		const left = record({
			outcome: "abandoned",
			winnerSeat: null,
			abandonedBySeat: 1,
			reason: "disconnect",
		});

		expect(resolve(left)).toMatchObject({ resolution: "seat0_win", reason: "disconnect" });
	});

	it("leaving before the duel started is a no-show for that seat", () => {
		const noShow = record({
			outcome: "abandoned",
			winnerSeat: null,
			startedAt: null,
			abandonedBySeat: 1,
			reason: "no_show",
		});

		expect(resolve(noShow)).toMatchObject({
			resolution: "no_show",
			reason: "no_show",
			noShowSeats: [1],
		});
	});

	it("a pre-start close nobody caused is a void, as is a restart mid-duel", () => {
		for (const reason of ["room_closed", "server_restart"]) {
			const closed = record({
				outcome: "abandoned",
				winnerSeat: null,
				startedAt: null,
				abandonedBySeat: null,
				reason,
			});
			expect(resolve(closed)).toMatchObject({ resolution: "void", reason });
		}
		const restarted = record({
			outcome: "abandoned",
			winnerSeat: null,
			abandonedBySeat: null,
			reason: "server_restart",
		});
		expect(resolve(restarted)).toMatchObject({ resolution: "void" });
	});

	it("a decided duel without a usable winner is a void", () => {
		expect(resolve(record({ winnerSeat: null }))).toMatchObject({
			resolution: "void",
			reason: "no_winner",
		});
	});

	it("an open row is live until the stale threshold, then a flagged void", () => {
		const open = record({ endedAt: null, outcome: null, winnerSeat: null, reason: null });

		expect(resolve(open)).toBeNull();
		expect(resolve(open, new Date(issuedAt.getTime() + STALE_MS))).toBeNull();
		expect(resolve(open, new Date(issuedAt.getTime() + STALE_MS + 1))).toEqual({
			resolution: "void",
			reason: "stale",
			noShowSeats: [],
			stale: true,
			unclaimed: false,
		});
	});

	it("a reservation nobody claimed is live for a while, then a no-show for both seats", () => {
		expect(resolve(null, new Date(issuedAt.getTime() + UNCLAIMED_RESERVATION_MS))).toBeNull();
		expect(resolve(null, new Date(issuedAt.getTime() + UNCLAIMED_RESERVATION_MS + 1))).toEqual({
			resolution: "no_show",
			reason: "unclaimed",
			noShowSeats: [0, 1],
			stale: false,
			unclaimed: true,
		});
	});
});

describe("outcomeForSeat", () => {
	const base = { reason: "", stale: false, unclaimed: false };

	it("maps each resolution to what each seat records", () => {
		const win0 = { ...base, resolution: "seat0_win" as const, noShowSeats: [] };
		expect(outcomeForSeat(win0, 0)).toBe("win");
		expect(outcomeForSeat(win0, 1)).toBe("loss");

		const draw = { ...base, resolution: "draw" as const, noShowSeats: [] };
		expect(outcomeForSeat(draw, 0)).toBe("draw");
		expect(outcomeForSeat(draw, 1)).toBe("draw");

		const noShow = { ...base, resolution: "no_show" as const, noShowSeats: [1] };
		expect(outcomeForSeat(noShow, 0)).toBe("void");
		expect(outcomeForSeat(noShow, 1)).toBe("no_show");

		const unclaimed = { ...base, resolution: "no_show" as const, noShowSeats: [0, 1] };
		expect(outcomeForSeat(unclaimed, 0)).toBe("no_show");
		expect(outcomeForSeat(unclaimed, 1)).toBe("no_show");

		const voided = { ...base, resolution: "void" as const, noShowSeats: [] };
		expect(outcomeForSeat(voided, 0)).toBe("void");
	});
});

describe("outcomeOfResolvedGame", () => {
	const game = (resolution: "seat0_win" | "draw" | "no_show" | "void", reason: string) => ({
		resolution,
		reason,
	});

	it("reads wins, draws and voids from the stored resolution", () => {
		expect(outcomeOfResolvedGame(game("seat0_win", "win"), null, 0)).toBe("win");
		expect(outcomeOfResolvedGame(game("seat0_win", "win"), null, 1)).toBe("loss");
		expect(outcomeOfResolvedGame(game("draw", "draw"), null, 1)).toBe("draw");
		expect(outcomeOfResolvedGame(game("void", "cancelled"), null, 0)).toBe("void");
	});

	it("tells which seat missed the room from the server's record", () => {
		const noShow = game("no_show", "no_show");
		const absentSeat1 = record({ outcome: "abandoned", startedAt: null, abandonedBySeat: 1 });

		expect(outcomeOfResolvedGame(noShow, absentSeat1, 0)).toBe("void");
		expect(outcomeOfResolvedGame(noShow, absentSeat1, 1)).toBe("no_show");
		expect(outcomeOfResolvedGame(game("no_show", "unclaimed"), null, 0)).toBe("no_show");
	});
});

describe("Swiss outcomes", () => {
	const base = { reason: "", stale: false, unclaimed: false };

	it("gives the present seat the win when the other one missed the room", () => {
		const noShow = { ...base, resolution: "no_show" as const, noShowSeats: [1] };

		expect(outcomeForSeat(noShow, 0, "swiss")).toBe("win");
		expect(outcomeForSeat(noShow, 1, "swiss")).toBe("no_show");
	});

	it("keeps both seats absent, and every other resolution as in the arena", () => {
		const unclaimed = { ...base, resolution: "no_show" as const, noShowSeats: [0, 1] };
		const win1 = { ...base, resolution: "seat1_win" as const, noShowSeats: [] };

		expect(outcomeForSeat(unclaimed, 0, "swiss")).toBe("no_show");
		expect(outcomeForSeat(unclaimed, 1, "swiss")).toBe("no_show");
		expect(outcomeForSeat(win1, 0, "swiss")).toBe("loss");
	});

	it("reads back a resolved Swiss no-show for each seat", () => {
		const game = { resolution: "no_show" as const, reason: "lobby_timeout" };
		const absentSeat1 = record({ startedAt: null, outcome: "abandoned", abandonedBySeat: 1 });

		expect(outcomeOfResolvedGame(game, absentSeat1, 0, "swiss")).toBe("win");
		expect(outcomeOfResolvedGame(game, absentSeat1, 1, "swiss")).toBe("no_show");
		expect(outcomeOfResolvedGame({ ...game, reason: "unclaimed" }, null, 0, "swiss")).toBe(
			"no_show",
		);
	});
});

describe("noShowSeatsOf", () => {
	it("names the seat that missed the room, both for an unclaimed reservation, none otherwise", () => {
		const absent = record({ startedAt: null, outcome: "abandoned", abandonedBySeat: 0 });

		expect(noShowSeatsOf({ resolution: "no_show", reason: "lobby_timeout" }, absent)).toEqual([0]);
		expect(noShowSeatsOf({ resolution: "no_show", reason: "unclaimed" }, null)).toEqual([0, 1]);
		expect(noShowSeatsOf({ resolution: "draw", reason: "draw" }, record())).toEqual([]);
	});
});
