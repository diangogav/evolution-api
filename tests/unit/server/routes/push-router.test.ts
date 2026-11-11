import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { DeletePushSubscription } from "../../../../src/modules/push/application/DeletePushSubscription";
import { SavePushSubscription } from "../../../../src/modules/push/application/SavePushSubscription";
import type { PushSubscription } from "../../../../src/modules/push/domain/PushSubscription";
import type { PushSubscriptionRepository } from "../../../../src/modules/push/domain/PushSubscriptionRepository";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import { createPushRouter } from "../../../../src/server/routes/push-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";

const P256DH =
	"BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc:APA91b";

class MemoryRepository implements PushSubscriptionRepository {
	readonly rows = new Map<string, PushSubscription>();
	async upsert(subscription: PushSubscription) {
		this.rows.set(subscription.endpoint, subscription);
	}
	async deleteByEndpointForUser(endpoint: string, userId: string) {
		if (this.rows.get(endpoint)?.userId === userId) this.rows.delete(endpoint);
	}
	async listByUsers(userIds: readonly string[]) {
		return [...this.rows.values()].filter((row) => userIds.includes(row.userId));
	}
	async deleteByEndpoint(endpoint: string) {
		this.rows.delete(endpoint);
	}
	async touch() {
		// Delivery timestamps are not observed by the router.
	}
}

function buildApp(publicKey: string | null = "BPUBLIC") {
	const repository = new MemoryRepository();
	const router = createPushRouter({
		requireUser: createRequireUser({
			jwt: { decode: (token) => ({ id: token }) },
			activeBans: { execute: async (userId) => (userId === "banned" ? { userId } : null) },
		}),
		publicKey,
		save: new SavePushSubscription(repository),
		remove: new DeletePushSubscription(repository),
	});
	return { app: new Elysia().onError(mapDomainErrorStatus).use(router), repository };
}

function send(method: string, path: string, token?: string, body?: unknown) {
	const headers: Record<string, string> = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined) headers["content-type"] = "application/json";
	return new Request(`http://localhost${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

const subscribe = { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH }, locale: "es-ES" };

describe("push router", () => {
	it("serves the public key without a token, or null when push is off", async () => {
		const on = await buildApp().app.handle(send("GET", "/push/public-key"));
		expect(on.status).toBe(200);
		expect(await on.json()).toEqual({ publicKey: "BPUBLIC" });

		const off = await buildApp(null).app.handle(send("GET", "/push/public-key"));
		expect(await off.json()).toEqual({ publicKey: null });
	});

	it("stores the caller's subscription with a normalised locale and answers 204", async () => {
		const { app, repository } = buildApp();

		const response = await app.handle(send("PUT", "/me/push-subscriptions", "u-1", subscribe));

		expect(response.status).toBe(204);
		expect(repository.rows.get(ENDPOINT)).toEqual({
			userId: "u-1",
			endpoint: ENDPOINT,
			p256dh: P256DH,
			auth: AUTH,
			locale: "es",
		});
	});

	it("moves the endpoint to the account that registers it last", async () => {
		const { app, repository } = buildApp();
		await app.handle(send("PUT", "/me/push-subscriptions", "u-1", subscribe));
		await app.handle(
			send("PUT", "/me/push-subscriptions", "u-2", { ...subscribe, locale: "en-GB" }),
		);

		expect(repository.rows.get(ENDPOINT)).toMatchObject({ userId: "u-2", locale: "en" });
	});

	it("rejects a non-https endpoint and a malformed body with 422", async () => {
		const { app } = buildApp();

		const http = await app.handle(
			send("PUT", "/me/push-subscriptions", "u-1", { ...subscribe, endpoint: "http://a.b/c" }),
		);
		expect(http.status).toBe(422);

		const missing = await app.handle(
			send("PUT", "/me/push-subscriptions", "u-1", { endpoint: ENDPOINT }),
		);
		expect(missing.status).toBe(422);
	});

	it("requires a token and rejects banned players", async () => {
		const { app } = buildApp();

		expect(
			(await app.handle(send("PUT", "/me/push-subscriptions", undefined, subscribe))).status,
		).toBe(401);
		expect(
			(
				await app.handle(
					send("DELETE", "/me/push-subscriptions", undefined, { endpoint: ENDPOINT }),
				)
			).status,
		).toBe(401);
		expect(
			(await app.handle(send("PUT", "/me/push-subscriptions", "banned", subscribe))).status,
		).toBe(403);
	});

	it("deletes only the caller's own endpoint and answers 204 either way", async () => {
		const { app, repository } = buildApp();
		await app.handle(send("PUT", "/me/push-subscriptions", "u-1", subscribe));

		const foreign = await app.handle(
			send("DELETE", "/me/push-subscriptions", "u-2", { endpoint: ENDPOINT }),
		);
		expect(foreign.status).toBe(204);
		expect(repository.rows.has(ENDPOINT)).toBe(true);

		const own = await app.handle(
			send("DELETE", "/me/push-subscriptions", "u-1", { endpoint: ENDPOINT }),
		);
		expect(own.status).toBe(204);
		expect(repository.rows.has(ENDPOINT)).toBe(false);

		const again = await app.handle(
			send("DELETE", "/me/push-subscriptions", "u-1", { endpoint: ENDPOINT }),
		);
		expect(again.status).toBe(204);
	});
});
