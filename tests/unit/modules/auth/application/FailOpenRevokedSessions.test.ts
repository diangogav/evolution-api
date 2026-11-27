import { describe, expect, it } from "bun:test";

import { FailOpenRevokedSessions } from "../../../../../src/modules/auth/application/FailOpenRevokedSessions";
import type { RevokedSessions } from "../../../../../src/modules/auth/domain/RevokedSessions";
import { InMemoryRevokedSessions } from "../InMemoryRevokedSessions";

const TIMEOUT_MS = 20;

function build(inner: RevokedSessions, clock = () => 0) {
	const errors: string[] = [];
	const store = new FailOpenRevokedSessions(
		inner,
		{ error: (message) => void errors.push(String(message)) },
		TIMEOUT_MS,
		clock,
	);
	return { store, errors };
}

const failing: RevokedSessions = {
	isRevoked: async () => {
		throw new Error("connection closed");
	},
	markRevoked: async () => {
		throw new Error("connection closed");
	},
};

const hanging: RevokedSessions = {
	isRevoked: () => new Promise(() => undefined),
	markRevoked: () => new Promise(() => undefined),
};

describe("FailOpenRevokedSessions", () => {
	it("answers what the list answers while it works", async () => {
		const inner = new InMemoryRevokedSessions();
		const { store, errors } = build(inner);

		await store.markRevoked(["family-1"]);

		expect(await store.isRevoked("family-1")).toBe(true);
		expect(await store.isRevoked("family-2")).toBe(false);
		expect(errors).toEqual([]);
	});

	it("lets the request through and logs when the list fails", async () => {
		const { store, errors } = build(failing);

		expect(await store.isRevoked("family-1")).toBe(false);
		expect(errors).toEqual([
			"Revoked-session lookup failed, continuing without it: connection closed",
		]);
	});

	it("lets the request through when the list does not answer in time", async () => {
		const { store, errors } = build(hanging);
		const started = performance.now();

		expect(await store.isRevoked("family-1")).toBe(false);

		expect(performance.now() - started).toBeLessThan(TIMEOUT_MS * 10);
		expect(errors[0]).toContain(`no answer within ${TIMEOUT_MS} ms`);
	});

	it("does not fail the caller when a mark fails or hangs", async () => {
		await expect(build(failing).store.markRevoked(["family-1"])).resolves.toBeUndefined();
		await expect(build(hanging).store.markRevoked(["family-1"])).resolves.toBeUndefined();
	});

	it("logs at most once a minute while the list stays down", async () => {
		let now = 0;
		const { store, errors } = build(failing, () => now);

		await store.isRevoked("family-1");
		now = 30_000;
		await store.isRevoked("family-1");
		await store.markRevoked(["family-1"]);
		now = 60_000;
		await store.isRevoked("family-1");

		expect(errors).toHaveLength(2);
	});
});
