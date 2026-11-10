import type { RedisClient } from "bun";

import { LightningChatEvent, LightningChatPublisher } from "../domain/LightningChatPublisher";

export const LIGHTNING_CHAT_CHANNEL_PREFIX = "lightning:chat:";

export function lightningChatChannel(tournamentId: string): string {
	return `${LIGHTNING_CHAT_CHANNEL_PREFIX}${tournamentId}`;
}

export function chatEventTournamentId(event: LightningChatEvent): string {
	return event.type === "message" ? event.message.tournamentId : event.tournamentId;
}

/** Publishes on the shared client: publishing is an ordinary command, unlike subscribing. */
export class RedisLightningChatPublisher implements LightningChatPublisher {
	constructor(private readonly client: Pick<RedisClient, "publish">) {}

	async publish(event: LightningChatEvent): Promise<void> {
		await this.client.publish(
			lightningChatChannel(chatEventTournamentId(event)),
			JSON.stringify(event),
		);
	}
}
