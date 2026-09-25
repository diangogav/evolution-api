/**
 * End of the 2026-09-09 bulk backfill. Ledger rows created before it carry
 * the backfill time, not the match time, so their order comes from the duel
 * they belong to. UTC, and kept as the literal the SQL parameter receives so
 * no process-local time zone is ever involved.
 */
export const BACKFILL_CUTOFF = "2026-09-10 00:00:00";
export const BACKFILL_CUTOFF_MS = Date.UTC(2026, 8, 10);

/** One active game as the replay sees it: already netted across ledger kinds. */
export type TierGame = {
	gameId: string;
	userId: string;
	rankId: string;
	/** The other user with an applied row for the same game and rank, when one exists. */
	opponentId: string | null;
	pointsDelta: number;
	won: boolean;
	appliedId: string;
	/** Epoch ms of the applied row. */
	appliedAt: number;
	/** Epoch ms of min(duels.date); only fetched for rows before the cutoff. */
	duelAt: number | null;
};

export function gameTime(game: TierGame): number {
	return game.appliedAt < BACKFILL_CUTOFF_MS && game.duelAt !== null ? game.duelAt : game.appliedAt;
}

/** Game time, then the applied row's created_at, then its id: the replay order. */
export function compareTierGames(a: TierGame, b: TierGame): number {
	return (
		gameTime(a) - gameTime(b) ||
		a.appliedAt - b.appliedAt ||
		(a.appliedId < b.appliedId ? -1 : a.appliedId > b.appliedId ? 1 : 0)
	);
}

/** The UTC calendar day (YYYY-MM-DD) an epoch-ms instant falls on. */
export function utcDay(epochMs: number): string {
	return new Date(epochMs).toISOString().slice(0, 10);
}
