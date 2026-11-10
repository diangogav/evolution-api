import { describe, expect, it, mock } from "bun:test";
import type { RedisClient } from "bun";

import {
	LIGHTNING_CHAT_RATE_MAX_MESSAGES,
	LIGHTNING_CHAT_RATE_WINDOW_SECONDS,
} from "../../../../../src/modules/lightning/domain/ChatRateLimiter";
import {
	BunRedisChatRateLimiter,
	CHAT_RATE_KEY_PREFIX,
	CHAT_RATE_SCRIPT,
} from "../../../../../src/modules/lightning/infrastructure/BunRedisChatRateLimiter";

function client(reply: unknown) {
	const send = mock(async (_command: string, _args: string[]) => reply);
	return { send, limiter: new BunRedisChatRateLimiter({ send } as unknown as RedisClient) };
}

describe("BunRedisChatRateLimiter", () => {
	it("allows 5 messages per 10 seconds", () => {
		expect(LIGHTNING_CHAT_RATE_MAX_MESSAGES).toBe(5);
		expect(LIGHTNING_CHAT_RATE_WINDOW_SECONDS).toBe(10);
	});

	it("counts each message on a key per tournament and user, starting the window on the first hit", async () => {
		const { send, limiter } = client(1);

		await limiter.consume("t-1", "u-1");

		const [command, args] = send.mock.calls[0];
		expect(command).toBe("EVAL");
		expect(args).toEqual([CHAT_RATE_SCRIPT, "1", "lightning:chat:rate:t-1:u-1", "10"]);
		expect(CHAT_RATE_KEY_PREFIX).toBe("lightning:chat:rate:");
		expect(CHAT_RATE_SCRIPT).toContain("redis.call('INCR', KEYS[1])");
		expect(CHAT_RATE_SCRIPT).toContain("redis.call('EXPIRE', KEYS[1], ARGV[1])");
	});

	it.each([1, 5])("allows the message when it is number %i in the window", async (count) => {
		const { limiter } = client(count);

		expect(await limiter.consume("t-1", "u-1")).toBe(true);
	});

	it("refuses the sixth message in the window", async () => {
		const { limiter } = client(6);

		expect(await limiter.consume("t-1", "u-1")).toBe(false);
	});

	it("fails loudly on a reply that is not a count", async () => {
		const { limiter } = client("OK");

		await expect(limiter.consume("t-1", "u-1")).rejects.toThrow();
	});
});
