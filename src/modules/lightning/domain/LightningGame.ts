export const LIGHTNING_GAME_STATUSES = ["pending", "applied", "voided"] as const;
export type LightningGameStatus = (typeof LIGHTNING_GAME_STATUSES)[number];

export const LIGHTNING_GAME_RESOLUTIONS = [
	"seat0_win",
	"seat1_win",
	"draw",
	"void",
	"no_show",
] as const;
export type LightningGameResolution = (typeof LIGHTNING_GAME_RESOLUTIONS)[number];

/** One reservation this module issued for a pairing; the row is the apply-once gate. */
export type LightningGame = {
	reservationId: string;
	tournamentId: string;
	seat0UserId: string;
	seat1UserId: string;
	issuedAt: Date;
	status: LightningGameStatus;
	resolution: LightningGameResolution | null;
	reason: string | null;
	appliedAt: Date | null;
	/** The Swiss round the game belongs to; null for an arena game. */
	round: number | null;
};

export function seatOf(
	game: Pick<LightningGame, "seat0UserId" | "seat1UserId">,
	userId: string,
): 0 | 1 | null {
	if (game.seat0UserId === userId) return 0;
	if (game.seat1UserId === userId) return 1;
	return null;
}
