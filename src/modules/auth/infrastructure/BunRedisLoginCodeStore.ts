import { RedisClient } from "bun";
import { randomUUID } from "crypto";

import { LOGIN_CODE_TTL_SECONDS, LoginCodeStore } from "../domain/LoginCodeStore";

export class BunRedisLoginCodeStore implements LoginCodeStore {
	private static readonly KEY_PREFIX = "login-code:";

	constructor(private readonly client: RedisClient) {}

	async issue(userId: string): Promise<string> {
		const code = randomUUID();
		// SET with its TTL in one command, so a crash can never leave a code that does not expire.
		await this.client.send("SET", [
			`${BunRedisLoginCodeStore.KEY_PREFIX}${code}`,
			userId,
			"EX",
			String(LOGIN_CODE_TTL_SECONDS),
		]);
		return code;
	}

	async consume(code: string): Promise<string | null> {
		// GETDEL reads and removes atomically: two requests with the same code cannot both win.
		const userId = await this.client.send("GETDEL", [
			`${BunRedisLoginCodeStore.KEY_PREFIX}${code}`,
		]);
		return typeof userId === "string" && userId !== "" ? userId : null;
	}
}
