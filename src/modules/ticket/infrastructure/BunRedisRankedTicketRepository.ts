import { RedisClient } from "bun";

import { GameTicket } from "../domain/GameTicket";
import { RankedTicketRepository } from "../domain/RankedTicketRepository";

export class BunRedisRankedTicketRepository implements RankedTicketRepository {
	private static readonly KEY_PREFIX = "ticket:";

	constructor(private readonly client: RedisClient) {}

	async save(ticket: GameTicket, userId: string): Promise<void> {
		const key = `${BunRedisRankedTicketRepository.KEY_PREFIX}${ticket.value}`;

		// Atomic SET with TTL in a single command — never set() + expire() (would leave a
		// window where the key has no TTL and a crash leaks an immortal ticket).
		await this.client.send("SET", [key, userId, "EX", String(GameTicket.TTL_SECONDS)]);
	}
}
