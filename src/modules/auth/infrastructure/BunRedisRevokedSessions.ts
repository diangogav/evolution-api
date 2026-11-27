import { RedisClient } from "bun";

import { RevokedSessions } from "../domain/RevokedSessions";

export class BunRedisRevokedSessions implements RevokedSessions {
	private static readonly KEY_PREFIX = "session:revoked:";

	/** @param ttlSeconds one JWT lifetime: past it, no JWT of the sign-in is valid anyway. */
	constructor(
		private readonly client: RedisClient,
		private readonly ttlSeconds: number,
	) {}

	async markRevoked(familyIds: readonly string[]): Promise<void> {
		await Promise.all(
			familyIds.map((familyId) =>
				this.client.send("SET", [
					`${BunRedisRevokedSessions.KEY_PREFIX}${familyId}`,
					"1",
					"EX",
					String(this.ttlSeconds),
				]),
			),
		);
	}

	async isRevoked(familyId: string): Promise<boolean> {
		const found = await this.client.send("EXISTS", [
			`${BunRedisRevokedSessions.KEY_PREFIX}${familyId}`,
		]);
		return Number(found) > 0;
	}
}
