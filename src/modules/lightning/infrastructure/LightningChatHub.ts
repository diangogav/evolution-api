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

/**
 * A chat event, or `reset`: the tournament's live events may have had a gap, so the reader
 * reloads the history.
 */
export type LightningChatHubEvent = LightningChatEvent | { type: "reset"; tournamentId: string };

export type LightningChatListener = (event: LightningChatHubEvent) => void;

/** The part of a Bun RedisClient the hub needs; a subscribed client accepts nothing else. */
export interface ChatSubscriberClient {
	subscribe(channel: string, listener: (message: string, channel: string) => void): Promise<number>;
	unsubscribe(channel: string): Promise<void>;
	close(): void;
	/** Fires on every connection, including each automatic reconnection. */
	onconnect: (() => void) | null;
	/** Fires once the client stops reconnecting; it is unusable afterwards. */
	onclose: ((error: Error) => void) | null;
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
 *
 * Redis forgets every subscription when the connection drops. After a reconnection the hub
 * subscribes each channel again, and after a client that stopped reconnecting it opens a
 * new one; either way the listeners of a channel get a `reset` once it is subscribed again,
 * since events published in between never reached them.
 */
export class LightningChatHub {
	private readonly listeners = new Map<string, Set<Registration>>();
	private readonly perUser = new Map<string, number>();
	private total = 0;
	private readonly subscribed = new Set<string>();
	/** Channels whose subscription may predate a reconnection, to drop and subscribe again. */
	private readonly stale = new Set<string>();
	/** Tournaments whose listeners get a `reset` once their channel is subscribed again. */
	private readonly needsReset = new Set<string>();
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
		this.stale.clear();
		this.needsReset.clear();
		this.client?.close();
		this.client = null;
	}

	private remove(tournamentId: string, registration: Registration): void {
		const set = this.listeners.get(tournamentId);
		if (!set?.delete(registration)) return;
		if (set.size === 0) {
			this.listeners.delete(tournamentId);
			this.needsReset.delete(tournamentId);
		}
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
		const channel = lightningChatChannel(tournamentId);
		let action = "unsubscribe from";
		try {
			if (this.stale.has(tournamentId)) {
				// Bun keeps a channel's callbacks across a reconnection although Redis dropped the
				// subscription, and subscribe adds a callback even when it is already there, so
				// the old one goes first or every message would arrive twice.
				if (this.subscribed.has(tournamentId)) {
					await this.subscriber().unsubscribe(channel);
					this.subscribed.delete(tournamentId);
				}
				this.stale.delete(tournamentId);
			}
			const wanted = this.listeners.has(tournamentId);
			if (wanted && !this.subscribed.has(tournamentId)) {
				action = "subscribe to";
				const client = this.subscriber();
				await client.subscribe(channel, this.onMessage);
				// A client replaced meanwhile is gone; the reconcile queued with the
				// replacement subscribes on the new one.
				if (this.closed || client !== this.client) return;
				this.subscribed.add(tournamentId);
				this.resetListeners(tournamentId);
			} else if (!wanted && this.subscribed.has(tournamentId)) {
				this.subscribed.delete(tournamentId);
				await this.subscriber().unsubscribe(channel);
			}
		} catch (error) {
			this.logger.error(`Lightning chat could not ${action} ${channel}: ${errorMessage(error)}`);
		}
	}

	private subscriber(): ChatSubscriberClient {
		if (!this.client) {
			const client = this.createClient();
			let connections = 0;
			client.onconnect = () => {
				connections += 1;
				if (connections > 1) this.onReconnect(client);
			};
			client.onclose = (error) => this.onGiveUp(client, error);
			this.client = client;
		}
		return this.client;
	}

	private onReconnect(client: ChatSubscriberClient): void {
		if (this.closed || client !== this.client) return;
		// Includes channels with a call in flight: a subscribe sent before the drop may
		// complete without a subscription behind it.
		const affected = new Set([...this.subscribed, ...this.queues.keys(), ...this.listeners.keys()]);
		for (const tournamentId of affected) {
			this.stale.add(tournamentId);
			if (this.listeners.has(tournamentId)) this.needsReset.add(tournamentId);
			this.sync(tournamentId);
		}
	}

	private onGiveUp(client: ChatSubscriberClient, error: Error): void {
		if (this.closed || client !== this.client) return;
		this.logger.error(`Lightning chat subscriber closed: ${errorMessage(error)}`);
		this.client = null;
		this.subscribed.clear();
		this.stale.clear();
		for (const tournamentId of this.listeners.keys()) {
			this.needsReset.add(tournamentId);
			this.sync(tournamentId);
		}
	}

	private resetListeners(tournamentId: string): void {
		if (!this.needsReset.delete(tournamentId)) return;
		this.notify(tournamentId, { type: "reset", tournamentId });
	}

	private notify(tournamentId: string, event: LightningChatHubEvent): void {
		// A copy: a listener may unregister itself, or another, while it runs.
		for (const { listener } of [...(this.listeners.get(tournamentId) ?? [])]) {
			try {
				listener(event);
			} catch (error) {
				const channel = lightningChatChannel(tournamentId);
				this.logger.error(`Lightning chat listener failed on ${channel}: ${errorMessage(error)}`);
			}
		}
	}

	private readonly onMessage = (message: string, channel: string): void => {
		if (!channel.startsWith(LIGHTNING_CHAT_CHANNEL_PREFIX)) return;
		const tournamentId = channel.slice(LIGHTNING_CHAT_CHANNEL_PREFIX.length);
		const event = parseEvent(message);
		if (!event || chatEventTournamentId(event) !== tournamentId) {
			this.logger.error(`Lightning chat dropped an unreadable event on ${channel}`);
			return;
		}
		this.notify(tournamentId, event);
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
