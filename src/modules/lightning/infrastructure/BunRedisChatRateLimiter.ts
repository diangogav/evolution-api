import { RedisClient } from "bun";

import {
	ChatRateLimiter,
	LIGHTNING_CHAT_RATE_MAX_MESSAGES,
	LIGHTNING_CHAT_RATE_WINDOW_SECONDS,
} from "../domain/ChatRateLimiter";

export const CHAT_RATE_KEY_PREFIX = "lightning:chat:rate:";

// INCR and the first-hit EXPIRE run as one script: a counter left without a TTL by a
// failure between the two commands would block the player for good.
export const CHAT_RATE_SCRIPT = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count`;

export class BunRedisChatRateLimiter implements ChatRateLimiter {
	constructor(private readonly client: RedisClient) {}

	async consume(tournamentId: string, userId: string): Promise<boolean> {
		const key = `${CHAT_RATE_KEY_PREFIX}${tournamentId}:${userId}`;
		const reply = await this.client.send("EVAL", [
			CHAT_RATE_SCRIPT,
			"1",
			key,
			String(LIGHTNING_CHAT_RATE_WINDOW_SECONDS),
		]);
		if (typeof reply !== "number") {
			throw new Error(`Unexpected chat rate reply for ${key}: ${String(reply)}`);
		}
		return reply <= LIGHTNING_CHAT_RATE_MAX_MESSAGES;
	}
}
