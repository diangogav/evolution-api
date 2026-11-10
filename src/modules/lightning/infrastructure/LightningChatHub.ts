import { RedisClient } from "bun";

import { config } from "../../../config";
import { Logger } from "../../../shared/logger/domain/Logger";
import { LightningChatEvent } from "../domain/LightningChatPublisher";
import {
	chatEventTournamentId,
	LIGHTNING_CHAT_CHANNEL_PREFIX,
	lightningChatChannel,
} from "./RedisLightningChatPublisher";

/** Open chat streams one user may hold on one instance. */
export const LIGHTNING_CHAT_STREAMS_PER_USER = 3;
/** Open chat streams one instance holds in total. */
export const LIGHTNING_CHAT_STREAMS_TOTAL = 2000;

export type LightningChatListener = (event: LightningChatEvent) => void;

/** The part of a Bun RedisClient the hub needs; a subscribed client accepts nothing else. */
export interface ChatSubscriberClient {
	subscribe(channel: string, listener: (message: string, channel: string) => void): Promise<number>;
	unsubscribe(channel: string): Promise<void>;
	close(): void;
}

type Registration = { userId: string; listener: LightningChatListener };

/**
 * Delivers the chat events of Redis to the streams open on this instance. It owns a
 * connection of its own because a subscribed Bun RedisClient refuses every other command,
 * and opens it on the first subscription.
 *
 * Each tournament channel is subscribed while it has at least one local listener. Redis
 * calls for one channel run strictly one after another, and each call compares the
 * subscription with the listeners present when it runs, so any interleaving of register
 * and unregister settles on "subscribed exactly when someone listens".
 */
export class LightningChatHub {
	private readonly listeners = new Map<string, Set<Registration>>();
	private readonly perUser = new Map<string, number>();
	private total = 0;
	private readonly subscribed = new Set<string>();
	private readonly queues = new Map<string, Promise<void>>();
	private client: ChatSubscriberClient | null = null;
	private closed = false;

	constructor(
		private readonly logger: Pick<Logger, "error">,
		private readonly createClient: () => ChatSubscriberClient = () =>
			new RedisClient(config.redis.url),
	) {}

	/** Registers a stream unless the user or the instance is at its limit; null when refused. */
	tryRegister(
		tournamentId: string,
		userId: string,
		listener: LightningChatListener,
	): (() => void) | null {
		if (this.total >= LIGHTNING_CHAT_STREAMS_TOTAL) return null;
		if (this.listenerCountOf(userId) >= LIGHTNING_CHAT_STREAMS_PER_USER) return null;
		return this.register(tournamentId, userId, listener);
	}

	/** Adds a listener for the tournament's events; the returned function removes it once. */
	register(tournamentId: string, userId: string, listener: LightningChatListener): () => void {
		const registration: Registration = { userId, listener };
		let set = this.listeners.get(tournamentId);
		if (!set) {
			set = new Set();
			this.listeners.set(tournamentId, set);
		}
		set.add(registration);
		this.total += 1;
		this.perUser.set(userId, this.listenerCountOf(userId) + 1);
		this.sync(tournamentId);

		let removed = false;
		return () => {
			if (removed) return;
			removed = true;
			this.remove(tournamentId, registration);
			this.sync(tournamentId);
		};
	}

	/**
	 * Resolves once every subscription change queued so far for the tournament has run,
	 * successfully or not. A stream awaits it before reading its replay, so no message falls
	 * between the replay and the live events.
	 */
	whenSettled(tournamentId: string): Promise<void> {
		return this.queues.get(tournamentId) ?? Promise.resolve();
	}

	listenerCount(): number {
		return this.total;
	}

	listenerCountOf(userId: string): number {
		return this.perUser.get(userId) ?? 0;
	}

	/** Drops every listener and the subscriber connection. */
	close(): void {
		this.closed = true;
		this.listeners.clear();
		this.perUser.clear();
		this.total = 0;
		this.subscribed.clear();
		this.client?.close();
		this.client = null;
	}

	private remove(tournamentId: string, registration: Registration): void {
		const set = this.listeners.get(tournamentId);
		if (!set?.delete(registration)) return;
		if (set.size === 0) this.listeners.delete(tournamentId);
		this.total -= 1;
		const left = this.listenerCountOf(registration.userId) - 1;
		if (left > 0) this.perUser.set(registration.userId, left);
		else this.perUser.delete(registration.userId);
	}

	private sync(tournamentId: string): void {
		const previous = this.queues.get(tournamentId) ?? Promise.resolve();
		const next = previous.then(() => this.reconcile(tournamentId));
		this.queues.set(tournamentId, next);
		void next.then(() => {
			if (this.queues.get(tournamentId) === next) this.queues.delete(tournamentId);
		});
	}

	// Never rejects: a failed Redis call is logged and the next register or unregister of the
	// tournament tries again.
	private async reconcile(tournamentId: string): Promise<void> {
		if (this.closed) return;
		const wanted = this.listeners.has(tournamentId);
		const channel = lightningChatChannel(tournamentId);
		try {
			if (wanted && !this.subscribed.has(tournamentId)) {
				await this.subscriber().subscribe(channel, this.onMessage);
				if (this.closed) return;
				this.subscribed.add(tournamentId);
			} else if (!wanted && this.subscribed.has(tournamentId)) {
				this.subscribed.delete(tournamentId);
				await this.subscriber().unsubscribe(channel);
			}
		} catch (error) {
			const action = wanted ? "subscribe to" : "unsubscribe from";
			this.logger.error(`Lightning chat could not ${action} ${channel}: ${errorMessage(error)}`);
		}
	}

	private subscriber(): ChatSubscriberClient {
		if (!this.client) this.client = this.createClient();
		return this.client;
	}

	private readonly onMessage = (message: string, channel: string): void => {
		if (!channel.startsWith(LIGHTNING_CHAT_CHANNEL_PREFIX)) return;
		const tournamentId = channel.slice(LIGHTNING_CHAT_CHANNEL_PREFIX.length);
		const event = parseEvent(message);
		if (!event || chatEventTournamentId(event) !== tournamentId) {
			this.logger.error(`Lightning chat dropped an unreadable event on ${channel}`);
			return;
		}
		// A copy: a listener may unregister itself, or another, while it runs.
		for (const { listener } of [...(this.listeners.get(tournamentId) ?? [])]) {
			try {
				listener(event);
			} catch (error) {
				this.logger.error(`Lightning chat listener failed on ${channel}: ${errorMessage(error)}`);
			}
		}
	};
}

function parseEvent(raw: string): LightningChatEvent | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(value)) return null;
	if (value.type === "deleted") {
		return typeof value.tournamentId === "string" && typeof value.id === "number"
			? { type: "deleted", tournamentId: value.tournamentId, id: value.id }
			: null;
	}
	if (value.type === "message" && isRecord(value.message)) {
		const message = value.message;
		const author = message.author;
		const valid =
			typeof message.id === "number" &&
			typeof message.tournamentId === "string" &&
			typeof message.body === "string" &&
			typeof message.createdAt === "string" &&
			isRecord(author) &&
			typeof author.userId === "string" &&
			typeof author.username === "string" &&
			typeof author.admin === "boolean";
		return valid ? (value as LightningChatEvent) : null;
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
