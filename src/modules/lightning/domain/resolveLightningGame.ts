import { ReservedDuelRecord } from "../../reserved-duel";
import { EntryGameOutcome } from "./LightningEntry";
import { LightningGame, LightningGameResolution } from "./LightningGame";
import { LightningSystem } from "./LightningTournament";

export type GameResolution = {
	resolution: LightningGameResolution;
	reason: string;
	/** Seats that never started the duel; each one takes a strike. */
	noShowSeats: number[];
	/** The server left the row open far too long: an infrastructure alert. */
	stale: boolean;
	/** Nobody ever claimed the reservation; the caller revokes it before trusting this. */
	unclaimed: boolean;
};

// A reservation is claimed within seconds of both clients learning they are paired. With
// no row at all after this long, both players are absent.
export const UNCLAIMED_RESERVATION_MS = 3 * 60 * 1000;

// Reasons the server records when the infrastructure, not a player, ended the room.
const INFRASTRUCTURE_REASONS = new Set(["server_restart", "room_closed", "unplayable"]);

/**
 * What the duel server's record means for the pairing, or null while the duel is live.
 * `staleAfterMs` bounds a row that never closes: with a per-turn clock no honest duel lasts
 * that long, so the game is voided and flagged.
 */
export function resolveLightningGame(
	game: Pick<LightningGame, "issuedAt">,
	record: ReservedDuelRecord | null,
	now: Date,
	staleAfterMs: number,
): GameResolution | null {
	const age = now.getTime() - game.issuedAt.getTime();
	const resolved = (
		resolution: LightningGameResolution,
		reason: string,
		extra: Partial<GameResolution> = {},
	): GameResolution => ({
		resolution,
		reason,
		noShowSeats: [],
		stale: false,
		unclaimed: false,
		...extra,
	});

	if (!record) {
		if (age <= UNCLAIMED_RESERVATION_MS) return null;
		return resolved("no_show", "unclaimed", { noShowSeats: [0, 1], unclaimed: true });
	}
	if (!record.endedAt) {
		if (age <= staleAfterMs) return null;
		return resolved("void", "stale", { stale: true });
	}

	if (record.outcome === "draw") return resolved("draw", "draw");
	if (record.outcome === "decided") {
		if (record.winnerSeat === 0) return resolved("seat0_win", record.reason ?? "win");
		if (record.winnerSeat === 1) return resolved("seat1_win", record.reason ?? "win");
		return resolved("void", "no_winner");
	}

	const reason = record.reason ?? "abandoned";
	if (record.abandonedBySeat === null || INFRASTRUCTURE_REASONS.has(reason)) {
		return resolved("void", reason);
	}
	if (record.startedAt) {
		return resolved(record.abandonedBySeat === 0 ? "seat1_win" : "seat0_win", reason);
	}
	return resolved("no_show", reason, { noShowSeats: [record.abandonedBySeat] });
}

// In the arena the present seat of a no-show simply plays someone else; a Swiss round has no
// one else to offer, so the present seat takes the win.
export function outcomeForSeat(
	resolution: GameResolution,
	seat: 0 | 1,
	system: LightningSystem = "arena",
): EntryGameOutcome {
	switch (resolution.resolution) {
		case "seat0_win":
			return seat === 0 ? "win" : "loss";
		case "seat1_win":
			return seat === 1 ? "win" : "loss";
		case "draw":
			return "draw";
		case "no_show":
			if (resolution.noShowSeats.includes(seat)) return "no_show";
			return system === "swiss" ? "win" : "void";
		case "void":
			return "void";
	}
}

/**
 * The seats that missed the room of a resolved no-show. The game row keeps the resolution,
 * not the seat, so it is read back from the server's record (an unclaimed reservation has
 * none: both seats missed it).
 */
export function noShowSeatsOf(
	game: { resolution: LightningGameResolution | null; reason: string | null },
	record: ReservedDuelRecord | null,
): number[] {
	if (game.resolution !== "no_show") return [];
	if (game.reason === "unclaimed") return [0, 1];
	const absent = record?.abandonedBySeat ?? null;
	return absent === null ? [0, 1] : [absent];
}

/** What a seat recorded from a game already resolved. */
export function outcomeOfResolvedGame(
	game: { resolution: LightningGameResolution; reason: string | null },
	record: ReservedDuelRecord | null,
	seat: 0 | 1,
	system: LightningSystem = "arena",
): EntryGameOutcome {
	return outcomeForSeat(
		{
			resolution: game.resolution,
			reason: game.reason ?? "",
			noShowSeats: noShowSeatsOf(game, record),
			stale: false,
			unclaimed: false,
		},
		seat,
		system,
	);
}
