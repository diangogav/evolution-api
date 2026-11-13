import { RedisClient } from "bun";

import {
	VERIFICATION_RESEND_WINDOW_SECONDS,
	VerificationResendThrottle,
} from "../domain/EmailVerifications";

export class BunRedisVerificationResendThrottle implements VerificationResendThrottle {
	private static readonly KEY_PREFIX = "email-verification:resend:";

	constructor(private readonly client: RedisClient) {}

	async allow(userId: string): Promise<boolean> {
		// NX with its TTL in one command: the first request in the window sets the key and
		// wins; the rest find it there. The key can never be left without an expiry.
		const reply = await this.client.send("SET", [
			`${BunRedisVerificationResendThrottle.KEY_PREFIX}${userId}`,
			"1",
			"NX",
			"EX",
			String(VERIFICATION_RESEND_WINDOW_SECONDS),
		]);

		return reply === "OK";
	}
}
