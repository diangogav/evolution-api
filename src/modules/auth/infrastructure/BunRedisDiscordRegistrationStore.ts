import { RedisClient } from "bun";
import { randomUUID } from "crypto";

import {
	DISCORD_REGISTRATION_TTL_SECONDS,
	DiscordRegistration,
	DiscordRegistrationStore,
} from "../domain/DiscordRegistration";

export class BunRedisDiscordRegistrationStore implements DiscordRegistrationStore {
	private static readonly KEY_PREFIX = "discord-registration:";

	constructor(private readonly client: RedisClient) {}

	async save(registration: DiscordRegistration): Promise<string> {
		const ticket = randomUUID();
		// SET with its TTL in one command, so a crash can never leave a ticket that does not expire.
		await this.client.send("SET", [
			this.key(ticket),
			JSON.stringify(registration),
			"EX",
			String(DISCORD_REGISTRATION_TTL_SECONDS),
		]);
		return ticket;
	}

	async find(ticket: string): Promise<DiscordRegistration | null> {
		const stored = await this.client.send("GET", [this.key(ticket)]);
		if (typeof stored !== "string" || stored === "") return null;

		try {
			const { discordId, email } = JSON.parse(stored) as Record<string, unknown>;
			return typeof discordId === "string" && typeof email === "string"
				? { discordId, email }
				: null;
		} catch {
			return null;
		}
	}

	async remove(ticket: string): Promise<void> {
		await this.client.send("DEL", [this.key(ticket)]);
	}

	private key(ticket: string): string {
		return `${BunRedisDiscordRegistrationStore.KEY_PREFIX}${ticket}`;
	}
}
