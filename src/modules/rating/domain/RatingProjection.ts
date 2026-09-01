/**
 * Rating a player starts from before any match, and therefore the value a
 * replay of an empty history has to land on. Mirrors INITIAL_RATING in the game
 * server's Rating value object (the owner of the live rating path) and the
 * defaults of the player_ratings rating and peak columns.
 */
export const INITIAL_RATING = 1000;

/**
 * Lowest rating a player can be projected down to. Mirrors RATING_FLOOR in the
 * game server's Rating value object: a loss always costs at least one point, so
 * without the floor a long enough losing streak walks a rating down through
 * zero and into negatives.
 */
export const RATING_FLOOR = 100;

export type RatingHistoryEntry = { kind: "applied" | "reversal"; delta: number };

export type ProjectedRating = { rating: number; gamesPlayed: number; peak: number };

/**
 * The part of `delta` a rating sitting at `rating` can actually absorb:
 * identical to `delta` unless the floor truncates it. Whoever persists a
 * rating_history row stores this value and not the raw delta, so that
 * `previousRating + storedDelta` is always the resulting rating. A row holding
 * a delta the rating never took does not reconcile with the rating it produced,
 * and replaying it backwards mints points out of a truncated loss.
 */
export function effectiveDelta(rating: number, delta: number): number {
	return Math.max(RATING_FLOOR, rating + delta) - rating;
}

/**
 * Replays a player's rating history into the value the live path holds. Because
 * every row already stores the delta its rating absorbed, this is a plain sum
 * and deliberately applies no floor of its own: clamping here would compute a
 * value the live path never stored, and it would make the result depend on the
 * order the rows are read in. The sum itself does not — only `peak`, a running
 * maximum, is order-sensitive.
 */
export function projectRating(entries: RatingHistoryEntry[]): ProjectedRating {
	let rating = INITIAL_RATING;
	let peak = INITIAL_RATING;
	let applied = 0;
	let reversals = 0;

	for (const entry of entries) {
		rating += entry.delta;
		peak = Math.max(peak, rating);

		if (entry.kind === "applied") {
			applied++;
		} else {
			reversals++;
		}
	}

	return { rating, gamesPlayed: Math.max(applied - reversals, 0), peak };
}
