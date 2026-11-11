import { describe, expect, it, mock } from "bun:test";
import { createECDH, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { generateVAPIDKeys } from "web-push";

import { pushTopic } from "../../../../../src/modules/push/domain/pushTopic";
import {
	type FetchLike,
	WebPushSender,
} from "../../../../../src/modules/push/infrastructure/WebPushSender";

// web-push's own decryption dependency: decrypting the body proves it carries the payload.
const ece = createRequire(import.meta.url)("http_ece") as {
	decrypt(
		buffer: Buffer,
		params: { version: string; privateKey: ReturnType<typeof createECDH>; authSecret: Buffer },
	): Buffer;
};

const vapidKeys = generateVAPIDKeys();
const vapid = {
	subject: "mailto:ops@example.com",
	publicKey: vapidKeys.publicKey,
	privateKey: vapidKeys.privateKey,
};

function browserSubscription() {
	const ecdh = createECDH("prime256v1");
	ecdh.generateKeys();
	const authSecret = randomBytes(16);
	return {
		ecdh,
		authSecret,
		subscription: {
			endpoint: "https://push.example.com/send/abc123",
			p256dh: ecdh.getPublicKey().toString("base64url"),
			auth: authSecret.toString("base64url"),
		},
	};
}

function logger() {
	return {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		error: mock((_message: unknown) => undefined),
	};
}

function answering(status: number) {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	const fetchFn: FetchLike = async (url, init) => {
		calls.push({ url, init });
		return new Response(null, { status });
	};
	return { fetchFn, calls };
}

const OPTIONS = { ttlSeconds: 90, urgency: "high" as const, topic: pushTopic("t", "RSV1") };

describe("WebPushSender", () => {
	it("posts the encrypted, VAPID-signed request that generateRequestDetails builds", async () => {
		const { ecdh, authSecret, subscription } = browserSubscription();
		const { fetchFn, calls } = answering(201);
		const payload = JSON.stringify({ type: "lightning-summons", title: "Ready" });

		const outcome = await new WebPushSender(vapid, logger(), fetchFn).send(
			subscription,
			payload,
			OPTIONS,
		);

		expect(outcome).toBe("sent");
		expect(calls).toHaveLength(1);
		const { url, init } = calls[0];
		expect(url).toBe(subscription.endpoint);
		expect(init.method).toBe("POST");
		const headers = init.headers as Record<string, string>;
		expect(headers).toMatchObject({
			TTL: "90",
			Urgency: "high",
			Topic: OPTIONS.topic,
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
		});
		expect(headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
		expect(headers.Authorization).toContain(`k=${vapid.publicKey}`);
		expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain("content-length");
		expect(init.signal).toBeInstanceOf(AbortSignal);

		const body = Buffer.from(init.body as Uint8Array);
		const clear = ece.decrypt(body, { version: "aes128gcm", privateKey: ecdh, authSecret });
		expect(clear.toString("utf8")).toBe(payload);
	});

	it.each([
		[200, "sent"],
		[201, "sent"],
		[202, "sent"],
		[404, "gone"],
		[410, "gone"],
		[400, "failed"],
		[403, "failed"],
		[413, "failed"],
		[429, "failed"],
		[500, "failed"],
	])("maps a %p answer to %p", async (status, expected) => {
		const { subscription } = browserSubscription();
		const { fetchFn } = answering(status);

		expect(
			await new WebPushSender(vapid, logger(), fetchFn).send(subscription, "{}", OPTIONS),
		).toBe(expected as "sent" | "gone" | "failed");
	});

	it("reports a network error as failed and logs only the push service host", async () => {
		const { subscription } = browserSubscription();
		const log = logger();
		const fetchFn: FetchLike = async () => {
			throw new Error("connect ECONNREFUSED");
		};

		expect(await new WebPushSender(vapid, log, fetchFn).send(subscription, "{}", OPTIONS)).toBe(
			"failed",
		);
		const message = String(log.error.mock.calls[0][0]);
		expect(message).toContain("push.example.com");
		expect(message).not.toContain("abc123");
	});

	it("reports keys it cannot encrypt for as failed without calling fetch", async () => {
		const { subscription } = browserSubscription();
		const { fetchFn, calls } = answering(201);

		const outcome = await new WebPushSender(vapid, logger(), fetchFn).send(
			{ ...subscription, p256dh: "AAAA" },
			"{}",
			OPTIONS,
		);

		expect(outcome).toBe("failed");
		expect(calls).toHaveLength(0);
	});
});
