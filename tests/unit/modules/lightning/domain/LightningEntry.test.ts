import { describe, expect, it } from "bun:test";

import {
	MAX_NO_SHOWS,
	MAX_SWISS_NO_SHOWS,
	newLightningEntry,
	recordBye,
	recordGameOutcome,
	recordSwissGameOutcome,
} from "../../../../../src/modules/lightning/domain/LightningEntry";

const NOW = new Date("2026-11-10T20:00:00Z");
const LATER = new Date("2026-11-10T20:12:00Z");
const deck = { main: [1, 2, 3], extra: [4], side: [] };

describe("newLightningEntry", () => {
	it("registers an active idle entry that only starts waiting once the arena runs", () => {
		const waiting = newLightningEntry({
			tournamentId: "t",
			userId: "u",
			deck,
			now: NOW,
			running: false,
		});
		const late = newLightningEntry({
			tournamentId: "t",
			userId: "u",
			deck,
			now: NOW,
			running: true,
		});

		expect(waiting).toEqual({
			tournamentId: "t",
			userId: "u",
			registeredAt: NOW,
			status: "active",
			presence: "idle",
			deck: { main: [1, 2, 3], extra: [4], side: [] },
			score: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			gamesPlayed: 0,
			noShows: 0,
			lastOpponentId: null,
			idleSince: null,
		});
		expect(waiting.deck).not.toBe(deck);
		expect(late.idleSince).toEqual(NOW);
	});
});

describe("recordGameOutcome", () => {
	const paired = {
		...newLightningEntry({ tournamentId: "t", userId: "u", deck, now: NOW, running: true }),
		presence: "paired" as const,
		lastOpponentId: "o",
	};

	it("scores a win 3, a draw 1 and a loss 0, counts the game and frees the player", () => {
		expect(recordGameOutcome(paired, "win", LATER)).toMatchObject({
			score: 3,
			wins: 1,
			gamesPlayed: 1,
			presence: "idle",
			idleSince: LATER,
			lastOpponentId: "o",
		});
		expect(recordGameOutcome(paired, "draw", LATER)).toMatchObject({
			score: 1,
			draws: 1,
			gamesPlayed: 1,
		});
		expect(recordGameOutcome(paired, "loss", LATER)).toMatchObject({
			score: 0,
			losses: 1,
			gamesPlayed: 1,
			presence: "idle",
		});
	});

	it("a void counts nothing and frees the player", () => {
		expect(recordGameOutcome(paired, "void", LATER)).toMatchObject({
			score: 0,
			gamesPlayed: 0,
			presence: "idle",
			idleSince: LATER,
		});
	});

	it("a no-show is a strike that sets the player away, and the third removes the entry", () => {
		const first = recordGameOutcome(paired, "no_show", LATER);
		expect(first).toMatchObject({ noShows: 1, presence: "away", status: "active", gamesPlayed: 0 });

		const third = recordGameOutcome({ ...paired, noShows: MAX_NO_SHOWS - 1 }, "no_show", LATER);
		expect(third).toMatchObject({ noShows: MAX_NO_SHOWS, status: "removed", presence: "away" });
	});

	it("never reactivates a withdrawn player", () => {
		const withdrawn = { ...paired, status: "withdrawn" as const };

		expect(recordGameOutcome(withdrawn, "win", LATER)).toMatchObject({
			status: "withdrawn",
			score: 3,
			presence: "idle",
		});
	});
});

describe("recordSwissGameOutcome", () => {
	const entry = {
		...newLightningEntry({ tournamentId: "t", userId: "u", deck, now: NOW, running: false }),
		presence: "playing" as const,
	};

	it("scores results like the arena and leaves the player waiting for the next round", () => {
		expect(recordSwissGameOutcome(entry, "win", LATER)).toMatchObject({
			score: 3,
			wins: 1,
			gamesPlayed: 1,
			presence: "idle",
		});
		expect(recordSwissGameOutcome(entry, "draw", LATER)).toMatchObject({ score: 1, draws: 1 });
		expect(recordSwissGameOutcome(entry, "loss", LATER)).toMatchObject({
			score: 0,
			losses: 1,
			gamesPlayed: 1,
		});
		expect(recordSwissGameOutcome(entry, "void", LATER)).toMatchObject({
			score: 0,
			gamesPlayed: 0,
			presence: "idle",
		});
	});

	it("counts a missed room as a lost game with a strike, never parking the player away", () => {
		expect(recordSwissGameOutcome(entry, "no_show", LATER)).toMatchObject({
			status: "active",
			presence: "idle",
			losses: 1,
			gamesPlayed: 1,
			noShows: 1,
		});
	});

	it("removes the player at the second missed room", () => {
		const struck = recordSwissGameOutcome(entry, "no_show", LATER);

		expect(recordSwissGameOutcome(struck, "no_show", LATER)).toMatchObject({
			status: "removed",
			noShows: MAX_SWISS_NO_SHOWS,
			losses: 2,
		});
	});

	it("keeps a withdrawn player withdrawn after a missed room", () => {
		const withdrawn = { ...entry, status: "withdrawn" as const, noShows: 1 };

		expect(recordSwissGameOutcome(withdrawn, "no_show", LATER).status).toBe("withdrawn");
	});
});

describe("recordBye", () => {
	it("counts the bye as a won game without touching presence", () => {
		const entry = newLightningEntry({
			tournamentId: "t",
			userId: "u",
			deck,
			now: NOW,
			running: false,
		});

		expect(recordBye(entry)).toEqual({ ...entry, score: 3, wins: 1, gamesPlayed: 1 });
	});
});
