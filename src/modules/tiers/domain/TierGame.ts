/** One active game as the replay sees it: already netted across ledger kinds. */
export type TierGame = {
	gameId: string;
	userId: string;
	rankId: string;
	/** The other user with an applied row for the same game and rank, when one exists. */
	opponentId: string | null;
	pointsDelta: number;
	won: boolean;
	/**
	 * The applied row's points_ledger.id, a canonical lowercase uuid. Postgres
	 * orders uuids by their bytes, which for that text form is plain lexical
	 * order, so string comparison here matches ORDER BY id in SQL.
	 */
	appliedId: string;
	/** Epoch ms of the applied row. */
	appliedAt: number;
	/** Epoch ms of min(duels.date) for the game, when a duel row exists. */
	duelAt: number | null;
};

/**
 * When the game was played. The ledger's created_at was bulk-written on
 * 2026-09-09 in dev and will be on another date in production, so it only
 * says when the row was written; duels.date is the game time everywhere.
 */
export function gameTime(game: TierGame): number {
	return game.duelAt ?? game.appliedAt;
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
