import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { GetMyFormats } from "../../../../src/modules/account-formats/application/GetMyFormats";
import { SaveMyFormats } from "../../../../src/modules/account-formats/application/SaveMyFormats";
import type { AccountFormat } from "../../../../src/modules/account-formats/domain/AccountFormats";
import type { AccountFormatsRepository } from "../../../../src/modules/account-formats/domain/AccountFormatsRepository";
import { createRequireUser } from "../../../../src/server/auth/requireUser";
import { createMeFormatsRouter } from "../../../../src/server/routes/me-formats-router";
import { mapDomainErrorStatus } from "../../../../src/server/server";

class MemoryRepository implements AccountFormatsRepository {
	readonly rows = new Map<string, AccountFormat[] | null>([
		["u-1", null],
		["u-2", null],
	]);
	async find(userId: string) {
		const row = this.rows.get(userId);
		return row === undefined ? undefined : row;
	}
	async save(userId: string, formats: readonly AccountFormat[]) {
		if (!this.rows.has(userId)) return false;
		this.rows.set(userId, [...formats]);
		return true;
	}
}

function buildApp() {
	const repository = new MemoryRepository();
	const router = createMeFormatsRouter({
		requireUser: createRequireUser({
			revokedSessions: { isRevoked: async () => false },
			jwt: { decode: (token) => ({ id: token }) },
			activeBans: { execute: async () => null },
		}),
		get: new GetMyFormats(repository),
		save: new SaveMyFormats(repository),
	});
	return { app: new Elysia().onError(mapDomainErrorStatus).use(router), repository };
}

function send(method: string, token?: string, body?: unknown) {
	const headers: Record<string, string> = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined) headers["content-type"] = "application/json";
	return new Request("http://localhost/me/formats", {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

describe("me formats router", () => {
	it("answers null for a player who never chose", async () => {
		const { app } = buildApp();

		const response = await app.handle(send("GET", "u-1"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ formats: null });
	});

	it("returns the stored choice after saving it, for that player only", async () => {
		const { app } = buildApp();
		await app.handle(send("PUT", "u-1", { formats: ["goat", "tcg"] }));

		const mine = await app.handle(send("GET", "u-1"));
		expect(mine.status).toBe(200);
		expect(await mine.json()).toEqual({ formats: ["tcg", "goat"] });

		const other = await app.handle(send("GET", "u-2"));
		expect(await other.json()).toEqual({ formats: null });
	});

	it("stores the formats deduplicated in catalogue order and answers them", async () => {
		const { app, repository } = buildApp();

		const response = await app.handle(
			send("PUT", "u-1", { formats: ["speed", "rush", "tcg", "rush", "jtp-adv-2007-03", "ocg"] }),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			formats: ["tcg", "ocg", "jtp-adv-2007-03", "rush", "speed"],
		});
		expect(repository.rows.get("u-1")).toEqual(["tcg", "ocg", "jtp-adv-2007-03", "rush", "speed"]);
	});

	it("keeps an empty list as a choice, distinct from never chosen", async () => {
		const { app, repository } = buildApp();

		const response = await app.handle(send("PUT", "u-1", { formats: [] }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ formats: [] });
		expect(repository.rows.get("u-1")).toEqual([]);
		expect(await (await app.handle(send("GET", "u-1"))).json()).toEqual({ formats: [] });
	});

	it("rejects an unknown format id with 400 and keeps the previous choice", async () => {
		const { app, repository } = buildApp();
		await app.handle(send("PUT", "u-1", { formats: ["tcg"] }));

		const response = await app.handle(send("PUT", "u-1", { formats: ["tcg", "master-duel"] }));

		expect(response.status).toBe(400);
		expect(await response.text()).toContain("master-duel");
		expect(repository.rows.get("u-1")).toEqual(["tcg"]);
	});

	it("rejects a body whose formats is not a list of ids with 400", async () => {
		const { app, repository } = buildApp();

		for (const body of [{ formats: "tcg" }, { formats: null }, { formats: [1] }, {}, ["tcg"]]) {
			const response = await app.handle(send("PUT", "u-1", body));
			expect(response.status).toBe(400);
		}
		expect((await app.handle(send("PUT", "u-1"))).status).toBe(400);
		expect(repository.rows.get("u-1")).toBeNull();
	});

	it("requires a token for both reading and saving", async () => {
		const { app, repository } = buildApp();

		expect((await app.handle(send("GET"))).status).toBe(401);
		expect((await app.handle(send("PUT", undefined, { formats: ["tcg"] }))).status).toBe(401);
		expect(repository.rows.get("u-1")).toBeNull();
	});

	it("answers 404 when the token's user no longer exists", async () => {
		const { app } = buildApp();

		expect((await app.handle(send("GET", "ghost"))).status).toBe(404);
		expect((await app.handle(send("PUT", "ghost", { formats: ["tcg"] }))).status).toBe(404);
	});
});
