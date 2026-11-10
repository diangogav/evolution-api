import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import type { LightningChatMessageView } from "../../../../src/modules/lightning/domain/LightningChatPublisher";
import type { GetLightningChatReplayInput } from "../../../../src/modules/lightning/application/GetLightningChatReplay";
import {
	type ChatSubscriberClient,
	LightningChatHub,
} from "../../../../src/modules/lightning/infrastructure/LightningChatHub";
import { LightningChatStreams } from "../../../../src/modules/lightning/infrastructure/LightningChatStreams";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import {
	createLightningRouter,
	type LightningRouterDependencies,
} from "../../../../src/server/routes/lightning-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { NotFoundError } from "../../../../src/shared/errors/NotFoundError";
import { TooManyRequestsError } from "../../../../src/shared/errors/TooManyRequestsError";

const ID = "8f14e45f-ceea-467a-9f0e-6b9e1c6a1a2b";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
const CHANNEL = `lightning:chat:${ID}`;

function view(id: number): LightningChatMessageView {
	return {
		id,
		tournamentId: ID,
		author: { userId: "u-1", username: "Jaden", admin: false },
		body: `message ${id}`,
		createdAt: "2026-11-13T20:05:00.000Z",
	};
}

class FakeSubscriber implements ChatSubscriberClient {
	private readonly handlers = new Map<string, (message: string, channel: string) => void>();

	async subscribe(channel: string, listener: (message: string, channel: string) => void) {
		this.handlers.set(channel, listener);
		return 1;
	}

	async unsubscribe(channel: string) {
		this.handlers.delete(channel);
	}

	close() {
		this.handlers.clear();
	}

	deliver(payload: unknown) {
		this.handlers.get(CHANNEL)?.(JSON.stringify(payload), CHANNEL);
	}
}

type Call = { useCase: string; input: unknown };

function buildApp() {
	const calls: Call[] = [];
	const subscriber = new FakeSubscriber();
	const hub = new LightningChatHub({ error: () => undefined }, () => subscriber);
	const heartbeats = new Set<() => void>();
	const replay = {
		answer: { messages: [] as LightningChatMessageView[], truncated: false },
		/** Runs while the replay is being read, as live events arriving mid-replay would. */
		during: (): void => undefined,
		async run(input: GetLightningChatReplayInput) {
			calls.push({ useCase: "replay", input });
			if (input.tournamentId !== ID) throw new NotFoundError("Lightning tournament not found");
			if (input.afterId === null) return { messages: [], truncated: false };
			replay.during();
			return replay.answer;
		},
	};
	const streams = new LightningChatStreams(
		hub,
		replay,
		{ error: () => undefined },
		{
			settleTimeoutMs: 50,
			repeat: (tick) => {
				heartbeats.add(tick);
				return () => heartbeats.delete(tick);
			},
		},
	);
	const record =
		<T>(useCase: string, answer: T | (() => T)) =>
		async (input: unknown) => {
			calls.push({ useCase, input });
			return typeof answer === "function" ? (answer as () => T)() : answer;
		};
	const unused = { run: async () => Promise.reject(new Error("not under test")) } as never;
	const answers = { post: (): unknown => view(7) };
	const deps: LightningRouterDependencies = {
		authorizer: {
			requireAdmin: (token) => {
				if (!token) throw new AuthenticationError("missing");
				if (token !== "admin-token") throw new ForbiddenError("admin required");
				return { userId: "admin-1" };
			},
			isAdmin: (token) => token === "admin-token",
		},
		requireUser: createRequireUser({
			jwt: { decode: (token) => ({ id: token }) },
			activeBans: { execute: async (userId) => (userId === "banned" ? { userId } : null) },
		}),
		clock: () => new Date("2026-11-13T20:10:00.000Z"),
		defaultSeason: 7,
		list: unused,
		get: unused,
		rankings: unused,
		enter: unused,
		withdraw: unused,
		pause: unused,
		resume: unused,
		myState: unused,
		myActive: unused,
		create: unused,
		cancel: unused,
		chatHistory: { run: record("history", [view(1), { id: 2, deleted: true }]) as never },
		chatPost: { run: record("post", () => answers.post()) as never },
		chatDelete: { run: record("delete", undefined) as never },
		chatStream: streams,
	};
	const app = new Elysia().onError(mapDomainErrorStatus).use(createLightningRouter(deps));
	return { app, calls, hub, subscriber, heartbeats, replay, answers };
}

function send(
	method: string,
	path: string,
	token?: string,
	options: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
) {
	const headers: Record<string, string> = { ...options.headers };
	if (token) headers.authorization = `Bearer ${token}`;
	if (options.body !== undefined) headers["content-type"] = "application/json";
	return new Request(`http://localhost/lightning${path}`, {
		method,
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		signal: options.signal,
	});
}

/** Reads the stream until `until` holds for the text so far, or fails after a short wait. */
async function readUntil(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	until: (text: string) => boolean,
	state: { text: string },
) {
	const decoder = new TextDecoder();
	const deadline = Date.now() + 1000;
	while (!until(state.text)) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new Error(`Stream never matched; got: ${state.text}`);
		const chunk = await Promise.race([
			reader.read(),
			Bun.sleep(remaining).then(() => ({ done: true, value: undefined })),
		]);
		if (chunk.done) throw new Error(`Stream ended; got: ${state.text}`);
		state.text += decoder.decode(chunk.value, { stream: true });
	}
	return state.text;
}

const frame = (id: number) => `event: message\nid: ${id}\ndata: ${JSON.stringify(view(id))}\n\n`;

describe("lightning chat — history", () => {
	it("answers 401 without a token and 403 for a banned player", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("GET", `/${ID}/chat`))).status).toBe(401);
		expect((await app.handle(send("GET", `/${ID}/chat`, "banned"))).status).toBe(403);
		expect(calls).toEqual([]);
	});

	it("reads the newest page by default and pages back with before and limit", async () => {
		const { app, calls } = buildApp();

		const newest = await app.handle(send("GET", `/${ID}/chat`, "u-2"));
		const older = await app.handle(send("GET", `/${ID}/chat?before=40&limit=10`, "u-2"));

		expect(newest.status).toBe(200);
		expect(await newest.json()).toEqual([view(1), { id: 2, deleted: true }]);
		expect(older.status).toBe(200);
		expect(calls).toEqual([
			{ useCase: "history", input: { tournamentId: ID, before: null, limit: 50 } },
			{ useCase: "history", input: { tournamentId: ID, before: 40, limit: 10 } },
		]);
	});

	it("rejects a limit above the page size and a non-positive cursor", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("GET", `/${ID}/chat?limit=51`, "u-2"))).status).toBe(422);
		expect((await app.handle(send("GET", `/${ID}/chat?limit=0`, "u-2"))).status).toBe(422);
		expect((await app.handle(send("GET", `/${ID}/chat?before=0`, "u-2"))).status).toBe(422);
		expect(calls).toEqual([]);
	});
});

describe("lightning chat — post", () => {
	it("answers 201 with the message and tells the use case whether the caller is an admin", async () => {
		const { app, calls } = buildApp();

		const player = await app.handle(send("POST", `/${ID}/chat`, "u-1", { body: { body: "gl" } }));
		const admin = await app.handle(
			send("POST", `/${ID}/chat`, "admin-token", { body: { body: "welcome" } }),
		);

		expect(player.status).toBe(201);
		expect(await player.json()).toEqual(view(7));
		expect(admin.status).toBe(201);
		expect(calls).toEqual([
			{ useCase: "post", input: { tournamentId: ID, userId: "u-1", isAdmin: false, body: "gl" } },
			{
				useCase: "post",
				input: { tournamentId: ID, userId: "admin-token", isAdmin: true, body: "welcome" },
			},
		]);
	});

	it("rejects a missing or oversized body before the use case", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("POST", `/${ID}/chat`, "u-1", { body: {} }))).status).toBe(422);
		const long = { body: { body: "x".repeat(201) } };
		expect((await app.handle(send("POST", `/${ID}/chat`, "u-1", long))).status).toBe(422);
		expect(calls).toEqual([]);
	});

	it("maps the use case's rate limit and entrant check to 429 and 403", async () => {
		const { app, answers } = buildApp();
		const post = () => app.handle(send("POST", `/${ID}/chat`, "u-1", { body: { body: "hi" } }));

		answers.post = () => {
			throw new TooManyRequestsError("slow down");
		};
		expect((await post()).status).toBe(429);
		answers.post = () => {
			throw new ForbiddenError("Only entrants can write in the tournament chat");
		};
		expect((await post()).status).toBe(403);
	});
});

describe("lightning chat — admin delete", () => {
	it("answers 403 for a player and 204 for an admin, passing the message id as a number", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("DELETE", `/${ID}/chat/12`, "u-1"))).status).toBe(403);
		const deleted = await app.handle(send("DELETE", `/${ID}/chat/12`, "admin-token"));

		expect(deleted.status).toBe(204);
		expect(await deleted.text()).toBe("");
		expect(calls).toEqual([
			{ useCase: "delete", input: { tournamentId: ID, messageId: 12, adminUserId: "admin-1" } },
		]);
	});

	it("rejects a message id that is not a positive integer", async () => {
		const { app, calls } = buildApp();

		expect((await app.handle(send("DELETE", `/${ID}/chat/abc`, "admin-token"))).status).toBe(422);
		expect(calls).toEqual([]);
	});
});

describe("lightning chat — stream", () => {
	it("answers 401 and 403 before opening, and 404 for an unknown tournament without registering", async () => {
		const { app, hub } = buildApp();

		expect((await app.handle(send("GET", `/${ID}/chat/stream`))).status).toBe(401);
		expect((await app.handle(send("GET", `/${ID}/chat/stream`, "banned"))).status).toBe(403);
		expect((await app.handle(send("GET", `/${UNKNOWN}/chat/stream`, "u-1"))).status).toBe(404);
		expect(hub.listenerCount()).toBe(0);
	});

	it("opens an unbuffered event stream and, without Last-Event-ID, sends only live events", async () => {
		const { app, calls, subscriber } = buildApp();

		const response = await app.handle(send("GET", `/${ID}/chat/stream`, "u-1"));
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		subscriber.deliver({ type: "message", message: view(5) });

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toStartWith("text/event-stream");
		expect(response.headers.get("cache-control")).toBe("no-cache");
		expect(response.headers.get("x-accel-buffering")).toBe("no");
		expect(await readUntil(reader, (text) => text.includes("id: 5"), { text: "" })).toBe(frame(5));
		expect(calls).toEqual([{ useCase: "replay", input: { tournamentId: ID, afterId: null } }]);
		await reader.cancel();
	});

	it("replays after Last-Event-ID, then flushes held live events without the ones replayed", async () => {
		const { app, calls, subscriber, replay } = buildApp();
		replay.answer = { messages: [view(11), view(12)], truncated: false };
		replay.during = () => {
			subscriber.deliver({ type: "message", message: view(12) });
			subscriber.deliver({ type: "deleted", tournamentId: ID, id: 11 });
			subscriber.deliver({ type: "message", message: view(13) });
		};

		const response = await app.handle(
			send("GET", `/${ID}/chat/stream`, "u-1", { headers: { "Last-Event-ID": "10" } }),
		);
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		const state = { text: "" };
		await readUntil(reader, (text) => text.includes("id: 13"), state);
		subscriber.deliver({ type: "message", message: view(13) });
		subscriber.deliver({ type: "message", message: view(14) });
		await readUntil(reader, (text) => text.includes("id: 14"), state);

		expect(state.text).toBe(
			`${frame(11)}${frame(12)}event: deleted\ndata: {"id":11}\n\n${frame(13)}${frame(14)}`,
		);
		expect(calls).toEqual([
			{ useCase: "replay", input: { tournamentId: ID, afterId: null } },
			{ useCase: "replay", input: { tournamentId: ID, afterId: 10 } },
		]);
		await reader.cancel();
	});

	it("ignores a Last-Event-ID that is not a message id", async () => {
		const { app, calls } = buildApp();

		const response = await app.handle(
			send("GET", `/${ID}/chat/stream`, "u-1", { headers: { "Last-Event-ID": "abc" } }),
		);

		expect(response.status).toBe(200);
		expect(calls).toEqual([{ useCase: "replay", input: { tournamentId: ID, afterId: null } }]);
		await response.body?.cancel();
	});

	it("sends a reset without an id after a truncated replay", async () => {
		const { app, replay } = buildApp();
		replay.answer = { messages: [view(3)], truncated: true };

		const response = await app.handle(
			send("GET", `/${ID}/chat/stream`, "u-1", { headers: { "Last-Event-ID": "2" } }),
		);
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		const text = await readUntil(reader, (t) => t.includes("reset"), { text: "" });

		expect(text).toBe(`${frame(3)}event: reset\ndata: {}\n\n`);
		await reader.cancel();
	});

	it("writes a ping comment on every heartbeat tick", async () => {
		const { app, heartbeats } = buildApp();

		const response = await app.handle(send("GET", `/${ID}/chat/stream`, "u-1"));
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		for (const tick of heartbeats) tick();

		expect(heartbeats.size).toBe(1);
		expect(await readUntil(reader, (text) => text.includes("ping"), { text: "" })).toBe(
			": ping\n\n",
		);
		await reader.cancel();
	});

	it("answers 429 above three streams per user and frees the slot when one closes", async () => {
		const { app, hub } = buildApp();
		const open = (user: string) => app.handle(send("GET", `/${ID}/chat/stream`, user));

		const streams = [await open("u-1"), await open("u-1"), await open("u-1")];
		const refused = await open("u-1");
		const otherUser = await open("u-2");

		expect(streams.map((response) => response.status)).toEqual([200, 200, 200]);
		expect(refused.status).toBe(429);
		expect(otherUser.status).toBe(200);
		await streams[0].body?.cancel();
		const reopened = await open("u-1");
		expect(reopened.status).toBe(200);
		expect(hub.listenerCountOf("u-1")).toBe(3);
		for (const response of [...streams.slice(1), otherUser, reopened]) {
			await response.body?.cancel();
		}
		expect(hub.listenerCount()).toBe(0);
	});

	it("unregisters and stops the heartbeat when the client aborts the request", async () => {
		const { app, hub, heartbeats } = buildApp();
		const controller = new AbortController();

		const response = await app.handle(
			send("GET", `/${ID}/chat/stream`, "u-1", { signal: controller.signal }),
		);
		expect(hub.listenerCount()).toBe(1);
		expect(heartbeats.size).toBe(1);
		controller.abort();

		expect(response.status).toBe(200);
		expect(hub.listenerCount()).toBe(0);
		expect(heartbeats.size).toBe(0);
		expect((await (response.body as ReadableStream).getReader().read()).done).toBe(true);
	});

	it("unregisters and stops the heartbeat when the reader cancels the stream", async () => {
		const { app, hub, heartbeats } = buildApp();

		const response = await app.handle(send("GET", `/${ID}/chat/stream`, "u-1"));
		await response.body?.cancel();

		expect(hub.listenerCount()).toBe(0);
		expect(heartbeats.size).toBe(0);
	});

	it("unregisters when the client is gone before the replay is written", async () => {
		const { app, hub, heartbeats, replay } = buildApp();
		const controller = new AbortController();
		replay.during = () => controller.abort();

		const response = await app.handle(
			send("GET", `/${ID}/chat/stream`, "u-1", {
				headers: { "Last-Event-ID": "1" },
				signal: controller.signal,
			}),
		);

		expect(response.status).toBe(200);
		expect(hub.listenerCount()).toBe(0);
		expect(heartbeats.size).toBe(0);
	});
});
