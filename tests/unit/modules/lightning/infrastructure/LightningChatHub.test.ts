import { describe, expect, it, mock } from "bun:test";

import {
	ChatSubscriberClient,
	LIGHTNING_CHAT_STREAMS_PER_USER,
	LIGHTNING_CHAT_STREAMS_TOTAL,
	LightningChatHub,
	LightningChatHubEvent,
} from "../../../../../src/modules/lightning/infrastructure/LightningChatHub";

const TOURNAMENT_A = "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";
const TOURNAMENT_B = "9e14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";
const CHANNEL_A = `lightning:chat:${TOURNAMENT_A}`;

type Pending = { resolve: () => void; reject: (error: Error) => void };
type Callback = (message: string, channel: string) => void;

// Mirrors Bun's RedisClient: callbacks stay registered client-side across a reconnect while
// the server forgets every subscription, and subscribe appends a callback without deduping.
// Calls stay pending until the test settles them when `manual` is set, to replay races.
class FakeSubscriber implements ChatSubscriberClient {
	calls: string[] = [];
	pending: Pending[] = [];
	manual = false;
	failNext: Error | null = null;
	closed = false;
	onconnect: (() => void) | null = null;
	onclose: ((error: Error) => void) | null = null;
	private connected = false;
	private readonly callbacks = new Map<string, Callback[]>();
	private readonly serverChannels = new Set<string>();

	subscribe(channel: string, listener: Callback) {
		this.connect();
		this.calls.push(`subscribe:${channel}`);
		return this.reply(() => {
			this.callbacks.set(channel, [...(this.callbacks.get(channel) ?? []), listener]);
			this.serverChannels.add(channel);
		}).then(() => 1);
	}

	unsubscribe(channel: string) {
		this.connect();
		this.calls.push(`unsubscribe:${channel}`);
		return this.reply(() => {
			this.callbacks.delete(channel);
			this.serverChannels.delete(channel);
		});
	}

	close() {
		this.closed = true;
	}

	/** Redis restarted and Bun reconnected on its own. */
	reconnect() {
		this.serverChannels.clear();
		this.onconnect?.();
	}

	/** Bun ran out of reconnection attempts. */
	giveUp(error = new Error("connection lost")) {
		this.serverChannels.clear();
		this.onclose?.(error);
	}

	deliver(channel: string, payload: unknown) {
		if (!this.serverChannels.has(channel)) return;
		const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
		for (const callback of this.callbacks.get(channel) ?? []) callback(raw, channel);
	}

	isSubscribed(channel: string) {
		return this.serverChannels.has(channel) && this.callbackCount(channel) > 0;
	}

	callbackCount(channel: string) {
		return this.callbacks.get(channel)?.length ?? 0;
	}

	async settleNext() {
		const next = this.pending.shift();
		next?.resolve();
		await flush();
	}

	private connect() {
		if (this.connected) return;
		this.connected = true;
		this.onconnect?.();
	}

	private reply(apply: () => void): Promise<void> {
		if (this.failNext) {
			const error = this.failNext;
			this.failNext = null;
			return Promise.reject(error);
		}
		if (!this.manual) {
			apply();
			return Promise.resolve();
		}
		return new Promise((resolve, reject) => {
			this.pending.push({
				resolve: () => {
					apply();
					resolve();
				},
				reject,
			});
		});
	}
}

async function flush() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup() {
	const subscriber = new FakeSubscriber();
	const subscribers = [subscriber];
	let used = 0;
	const created = mock(() => {
		if (used === subscribers.length) subscribers.push(new FakeSubscriber());
		return subscribers[used++];
	});
	const logger = { error: mock((_error: string | Error) => undefined) };
	const hub = new LightningChatHub(logger, created);
	return { subscriber, subscribers, created, logger, hub };
}

const message = (id: number, tournamentId = TOURNAMENT_A): LightningChatHubEvent => ({
	type: "message",
	message: {
		id,
		tournamentId,
		author: { userId: "u-1", username: "alice", admin: false },
		body: `m${id}`,
		createdAt: "2026-11-10T20:15:00.000Z",
	},
});

describe("LightningChatHub", () => {
	it("opens no connection until the first listener registers", async () => {
		const { created, hub } = setup();

		expect(created).not.toHaveBeenCalled();
		hub.register(TOURNAMENT_A, "u-1", () => undefined);
		await hub.whenSettled(TOURNAMENT_A);

		expect(created).toHaveBeenCalledTimes(1);
	});

	it("subscribes on the first local listener and unsubscribes when the last leaves", async () => {
		const { subscriber, hub } = setup();

		const first = hub.register(TOURNAMENT_A, "u-1", () => undefined);
		const second = hub.register(TOURNAMENT_A, "u-2", () => undefined);
		await hub.whenSettled(TOURNAMENT_A);
		first();
		await hub.whenSettled(TOURNAMENT_A);
		expect(subscriber.isSubscribed(CHANNEL_A)).toBe(true);
		second();
		await hub.whenSettled(TOURNAMENT_A);

		expect(subscriber.calls).toEqual([`subscribe:${CHANNEL_A}`, `unsubscribe:${CHANNEL_A}`]);
		expect(subscriber.isSubscribed(CHANNEL_A)).toBe(false);
	});

	it("delivers each event to every listener of its tournament only", async () => {
		const { subscriber, hub } = setup();
		const a: LightningChatHubEvent[] = [];
		const b: LightningChatHubEvent[] = [];
		const other: LightningChatHubEvent[] = [];
		hub.register(TOURNAMENT_A, "u-1", (event) => a.push(event));
		hub.register(TOURNAMENT_A, "u-2", (event) => b.push(event));
		hub.register(TOURNAMENT_B, "u-3", (event) => other.push(event));
		await hub.whenSettled(TOURNAMENT_A);
		await hub.whenSettled(TOURNAMENT_B);

		subscriber.deliver(CHANNEL_A, message(1));
		subscriber.deliver(CHANNEL_A, { type: "deleted", tournamentId: TOURNAMENT_A, id: 1 });

		expect(a).toEqual([message(1), { type: "deleted", tournamentId: TOURNAMENT_A, id: 1 }]);
		expect(b).toEqual(a);
		expect(other).toEqual([]);
	});

	it("drops and logs payloads that are not chat events of the channel's tournament", async () => {
		const { subscriber, logger, hub } = setup();
		const received: LightningChatHubEvent[] = [];
		hub.register(TOURNAMENT_A, "u-1", (event) => received.push(event));
		await hub.whenSettled(TOURNAMENT_A);

		subscriber.deliver(CHANNEL_A, "not json");
		subscriber.deliver(CHANNEL_A, { type: "message", message: { id: "1" } });
		subscriber.deliver(CHANNEL_A, { type: "deleted", tournamentId: TOURNAMENT_A });
		subscriber.deliver(CHANNEL_A, message(2, TOURNAMENT_B));
		subscriber.deliver(CHANNEL_A, [1, 2]);

		expect(received).toEqual([]);
		expect(logger.error).toHaveBeenCalledTimes(5);
	});

	it("keeps delivering to the other listeners when one throws", async () => {
		const { subscriber, logger, hub } = setup();
		const received: LightningChatHubEvent[] = [];
		hub.register(TOURNAMENT_A, "u-1", () => {
			throw new Error("stream closed");
		});
		hub.register(TOURNAMENT_A, "u-2", (event) => received.push(event));
		await hub.whenSettled(TOURNAMENT_A);

		subscriber.deliver(CHANNEL_A, message(1));

		expect(received).toEqual([message(1)]);
		expect(String(logger.error.mock.calls[0][0])).toContain("stream closed");
	});

	it("unsubscribes once a subscribe still in flight completes for a listener that already left", async () => {
		const { subscriber, hub } = setup();
		subscriber.manual = true;

		const unregister = hub.register(TOURNAMENT_A, "u-1", () => undefined);
		await flush();
		unregister();
		await subscriber.settleNext();
		await subscriber.settleNext();
		await hub.whenSettled(TOURNAMENT_A);

		expect(subscriber.calls).toEqual([`subscribe:${CHANNEL_A}`, `unsubscribe:${CHANNEL_A}`]);
		expect(subscriber.isSubscribed(CHANNEL_A)).toBe(false);
	});

	it("subscribes again after an unsubscribe in flight when a listener arrives meanwhile", async () => {
		const { subscriber, hub } = setup();
		const first = hub.register(TOURNAMENT_A, "u-1", () => undefined);
		await hub.whenSettled(TOURNAMENT_A);
		subscriber.manual = true;

		first();
		await flush();
		const received: LightningChatHubEvent[] = [];
		hub.register(TOURNAMENT_A, "u-2", (event) => received.push(event));
		await subscriber.settleNext();
		await subscriber.settleNext();
		await hub.whenSettled(TOURNAMENT_A);
		subscriber.deliver(CHANNEL_A, message(3));

		expect(subscriber.calls).toEqual([
			`subscribe:${CHANNEL_A}`,
			`unsubscribe:${CHANNEL_A}`,
			`subscribe:${CHANNEL_A}`,
		]);
		expect(received).toEqual([message(3)]);
	});

	it("issues no Redis call when a listener comes and goes before its subscribe starts", async () => {
		const { subscriber, hub } = setup();

		const unregister = hub.register(TOURNAMENT_A, "u-1", () => undefined);
		unregister();
		await hub.whenSettled(TOURNAMENT_A);

		expect(subscriber.calls).toEqual([]);
	});

	it("settles only after the subscription for a new listener is in place", async () => {
		const { subscriber, hub } = setup();
		subscriber.manual = true;
		let settled = false;

		hub.register(TOURNAMENT_A, "u-1", () => undefined);
		void hub.whenSettled(TOURNAMENT_A).then(() => {
			settled = true;
		});
		await flush();
		expect(settled).toBe(false);
		await subscriber.settleNext();

		expect(settled).toBe(true);
	});

	it("logs a failed subscribe and retries it on the next registration", async () => {
		const { subscriber, logger, hub } = setup();
		subscriber.failNext = new Error("connection refused");

		hub.register(TOURNAMENT_A, "u-1", () => undefined);
		await hub.whenSettled(TOURNAMENT_A);
		expect(subscriber.isSubscribed(CHANNEL_A)).toBe(false);
		expect(String(logger.error.mock.calls[0][0])).toContain("connection refused");

		hub.register(TOURNAMENT_A, "u-2", () => undefined);
		await hub.whenSettled(TOURNAMENT_A);

		expect(subscriber.isSubscribed(CHANNEL_A)).toBe(true);
	});

	it("counts listeners in total and per user, and an unregister counts once", async () => {
		const { hub } = setup();

		const a = hub.register(TOURNAMENT_A, "u-1", () => undefined);
		hub.register(TOURNAMENT_B, "u-1", () => undefined);
		hub.register(TOURNAMENT_A, "u-2", () => undefined);
		a();
		a();

		expect(hub.listenerCount()).toBe(2);
		expect(hub.listenerCountOf("u-1")).toBe(1);
		expect(hub.listenerCountOf("u-2")).toBe(1);
		expect(hub.listenerCountOf("u-3")).toBe(0);
	});

	it("refuses a stream beyond the per-user limit and accepts it once one closes", () => {
		const { hub } = setup();
		const unregisters = Array.from({ length: LIGHTNING_CHAT_STREAMS_PER_USER }, () =>
			hub.tryRegister(TOURNAMENT_A, "u-1", () => undefined),
		);

		expect(unregisters.every((unregister) => unregister !== null)).toBe(true);
		expect(hub.tryRegister(TOURNAMENT_B, "u-1", () => undefined)).toBeNull();
		expect(hub.tryRegister(TOURNAMENT_A, "u-2", () => undefined)).not.toBeNull();
		unregisters[0]?.();
		expect(hub.tryRegister(TOURNAMENT_A, "u-1", () => undefined)).not.toBeNull();
	});

	it("refuses a stream beyond the instance limit", () => {
		const { hub } = setup();
		for (let i = 0; i < LIGHTNING_CHAT_STREAMS_TOTAL; i++) {
			hub.register(TOURNAMENT_A, `u-${i}`, () => undefined);
		}

		expect(hub.tryRegister(TOURNAMENT_A, "newcomer", () => undefined)).toBeNull();
	});

	it("holds 3 streams per user and 2000 per instance", () => {
		expect(LIGHTNING_CHAT_STREAMS_PER_USER).toBe(3);
		expect(LIGHTNING_CHAT_STREAMS_TOTAL).toBe(2000);
	});

	it("closes the subscriber connection and drops every listener", async () => {
		const { subscriber, hub } = setup();
		const received: LightningChatHubEvent[] = [];
		hub.register(TOURNAMENT_A, "u-1", (event) => received.push(event));
		await hub.whenSettled(TOURNAMENT_A);

		hub.close();
		subscriber.deliver(CHANNEL_A, message(1));

		expect(subscriber.closed).toBe(true);
		expect(received).toEqual([]);
		expect(hub.listenerCount()).toBe(0);
	});

	describe("when Redis drops the connection", () => {
		const reset = (tournamentId = TOURNAMENT_A): LightningChatHubEvent => ({
			type: "reset",
			tournamentId,
		});

		it("sends no reset and no extra call on the first connect", async () => {
			const { subscriber, hub } = setup();
			const received: LightningChatHubEvent[] = [];
			hub.register(TOURNAMENT_A, "u-1", (event) => received.push(event));
			await hub.whenSettled(TOURNAMENT_A);

			expect(subscriber.calls).toEqual([`subscribe:${CHANNEL_A}`]);
			expect(received).toEqual([]);
		});

		it("re-subscribes every listened channel after a reconnect, delivering each message once", async () => {
			const { subscriber, hub } = setup();
			const a: LightningChatHubEvent[] = [];
			const b: LightningChatHubEvent[] = [];
			hub.register(TOURNAMENT_A, "u-1", (event) => a.push(event));
			hub.register(TOURNAMENT_B, "u-2", (event) => b.push(event));
			await hub.whenSettled(TOURNAMENT_A);
			await hub.whenSettled(TOURNAMENT_B);
			subscriber.calls = [];

			subscriber.reconnect();
			await hub.whenSettled(TOURNAMENT_A);
			await hub.whenSettled(TOURNAMENT_B);
			subscriber.deliver(CHANNEL_A, message(1));

			const channelB = `lightning:chat:${TOURNAMENT_B}`;
			for (const channel of [CHANNEL_A, channelB]) {
				expect(subscriber.calls.filter((call) => call.endsWith(channel))).toEqual([
					`unsubscribe:${channel}`,
					`subscribe:${channel}`,
				]);
				expect(subscriber.callbackCount(channel)).toBe(1);
			}
			expect(a).toEqual([reset(), message(1)]);
			expect(b).toEqual([reset(TOURNAMENT_B)]);
		});

		it("hears live events on a stream opened after the reconnect", async () => {
			const { subscriber, hub } = setup();
			hub.register(TOURNAMENT_A, "u-1", () => undefined);
			await hub.whenSettled(TOURNAMENT_A);
			subscriber.reconnect();

			const received: LightningChatHubEvent[] = [];
			hub.register(TOURNAMENT_A, "u-2", (event) => received.push(event));
			await hub.whenSettled(TOURNAMENT_A);
			subscriber.deliver(CHANNEL_A, message(2));

			expect(received.filter((event): boolean => event.type === "message")).toEqual([message(2)]);
		});

		it("refreshes a subscribe that was in flight when the connection dropped", async () => {
			const { subscriber, hub } = setup();
			subscriber.manual = true;
			const received: LightningChatHubEvent[] = [];
			hub.register(TOURNAMENT_A, "u-1", (event) => received.push(event));
			await flush();

			subscriber.reconnect();
			await subscriber.settleNext();
			await subscriber.settleNext();
			await subscriber.settleNext();
			await hub.whenSettled(TOURNAMENT_A);
			subscriber.deliver(CHANNEL_A, message(3));

			expect(subscriber.calls).toEqual([
				`subscribe:${CHANNEL_A}`,
				`unsubscribe:${CHANNEL_A}`,
				`subscribe:${CHANNEL_A}`,
			]);
			expect(received).toEqual([reset(), message(3)]);
		});

		it("drops the stale callback of a channel whose listeners left during the reconnect", async () => {
			const { subscriber, hub } = setup();
			const unregister = hub.register(TOURNAMENT_A, "u-1", () => undefined);
			await hub.whenSettled(TOURNAMENT_A);
			subscriber.calls = [];

			subscriber.reconnect();
			unregister();
			await hub.whenSettled(TOURNAMENT_A);

			expect(subscriber.calls).toEqual([`unsubscribe:${CHANNEL_A}`]);
			expect(subscriber.callbackCount(CHANNEL_A)).toBe(0);
		});

		it("retries a failed re-subscribe on the next registration and resets the listeners then", async () => {
			const { subscriber, logger, hub } = setup();
			const received: LightningChatHubEvent[] = [];
			hub.register(TOURNAMENT_A, "u-1", (event) => received.push(event));
			await hub.whenSettled(TOURNAMENT_A);

			subscriber.failNext = new Error("loading dataset");
			subscriber.reconnect();
			await hub.whenSettled(TOURNAMENT_A);
			expect(received).toEqual([]);
			expect(String(logger.error.mock.calls[0][0])).toContain("loading dataset");

			hub.register(TOURNAMENT_A, "u-2", () => undefined);
			await hub.whenSettled(TOURNAMENT_A);
			subscriber.deliver(CHANNEL_A, message(4));

			expect(subscriber.callbackCount(CHANNEL_A)).toBe(1);
			expect(received).toEqual([reset(), message(4)]);
		});

		it("replaces a subscriber that gave up, re-subscribing listened channels and resetting their listeners", async () => {
			const { subscribers, created, logger, hub } = setup();
			const received: LightningChatHubEvent[] = [];
			hub.register(TOURNAMENT_A, "u-1", (event) => received.push(event));
			await hub.whenSettled(TOURNAMENT_A);

			subscribers[0].giveUp(new Error("max retries"));
			await hub.whenSettled(TOURNAMENT_A);
			subscribers[1].deliver(CHANNEL_A, message(5));

			expect(created).toHaveBeenCalledTimes(2);
			expect(subscribers[1].calls).toEqual([`subscribe:${CHANNEL_A}`]);
			expect(received).toEqual([reset(), message(5)]);
			expect(String(logger.error.mock.calls[0][0])).toContain("max retries");
		});

		it("opens a new subscriber for the next stream after one gave up with no listeners", async () => {
			const { subscribers, created, hub } = setup();
			const unregister = hub.register(TOURNAMENT_A, "u-1", () => undefined);
			await hub.whenSettled(TOURNAMENT_A);
			unregister();
			await hub.whenSettled(TOURNAMENT_A);

			subscribers[0].giveUp();
			await flush();
			expect(created).toHaveBeenCalledTimes(1);
			const received: LightningChatHubEvent[] = [];
			hub.register(TOURNAMENT_A, "u-2", (event) => received.push(event));
			await hub.whenSettled(TOURNAMENT_A);
			subscribers[1].deliver(CHANNEL_A, message(6));

			expect(received).toEqual([message(6)]);
		});

		it("does not count a subscribe that completes on a subscriber that already gave up", async () => {
			const { subscribers, hub } = setup();
			subscribers[0].manual = true;
			const received: LightningChatHubEvent[] = [];
			hub.register(TOURNAMENT_A, "u-1", (event) => received.push(event));
			await flush();

			subscribers[0].giveUp();
			await subscribers[0].settleNext();
			await hub.whenSettled(TOURNAMENT_A);
			subscribers[1].deliver(CHANNEL_A, message(7));

			expect(subscribers[1].calls).toEqual([`subscribe:${CHANNEL_A}`]);
			expect(received).toEqual([reset(), message(7)]);
		});

		it("ignores connection events of a subscriber it replaced or closed", async () => {
			const { subscribers, created, hub } = setup();
			hub.register(TOURNAMENT_A, "u-1", () => undefined);
			await hub.whenSettled(TOURNAMENT_A);
			subscribers[0].giveUp();
			await hub.whenSettled(TOURNAMENT_A);

			subscribers[0].reconnect();
			subscribers[0].giveUp();
			await hub.whenSettled(TOURNAMENT_A);
			expect(created).toHaveBeenCalledTimes(2);
			expect(subscribers[0].calls).toEqual([`subscribe:${CHANNEL_A}`]);

			hub.close();
			subscribers[1].giveUp();
			await flush();
			expect(created).toHaveBeenCalledTimes(2);
		});
	});
});
