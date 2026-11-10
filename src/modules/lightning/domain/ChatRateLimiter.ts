export const LIGHTNING_CHAT_RATE_MAX_MESSAGES = 5;
export const LIGHTNING_CHAT_RATE_WINDOW_SECONDS = 10;

/**
 * Counts chat messages per player and tournament in a fixed window of
 * LIGHTNING_CHAT_RATE_WINDOW_SECONDS. consume() records one attempt and answers whether it
 * stays within LIGHTNING_CHAT_RATE_MAX_MESSAGES; refused attempts count too.
 */
export interface ChatRateLimiter {
	consume(tournamentId: string, userId: string): Promise<boolean>;
}
