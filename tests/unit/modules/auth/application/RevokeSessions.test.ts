import { beforeEach, describe, expect, it } from "bun:test";

import { RevokeMyOtherSessions } from "../../../../../src/modules/auth/application/RevokeMyOtherSessions";
import { RevokeMySession } from "../../../../../src/modules/auth/application/RevokeMySession";
import { RevokeSessions } from "../../../../../src/modules/auth/application/RevokeSessions";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { InMemoryRefreshTokens } from "../InMemoryRefreshTokens";
import { InMemoryRevokedSessions } from "../InMemoryRevokedSessions";

const NOW = new Date("2026-11-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("revoking sign-ins", () => {
	let tokens: InMemoryRefreshTokens;
	let revoked: InMemoryRevokedSessions;
	let revokeSessions: RevokeSessions;
	let serial: number;

	beforeEach(() => {
		tokens = new InMemoryRefreshTokens();
		revoked = new InMemoryRevokedSessions();
		revokeSessions = new RevokeSessions(tokens, revoked);
		serial = 0;
	});

	const signIn = async (familyId: string, userId = "user-1") => {
		serial++;
		await tokens.save({
			id: `token-${serial}`,
			userId,
			familyId,
			tokenHash: `hash-${serial}`,
			mustUpgrade: false,
			createdAt: NOW,
			expiresAt: new Date(NOW.getTime() + 30 * DAY),
			userAgent: null,
			signedInAt: NOW,
		});
	};
	const liveFamilies = async (userId = "user-1") =>
		(await tokens.listActiveForUser(userId, NOW)).map((session) => session.familyId).sort();

	describe("RevokeSessions", () => {
		it("marks every sign-in it ends for a user, once each, and leaves other users alone", async () => {
			await signIn("phone");
			await signIn("phone");
			await signIn("laptop");
			await signIn("theirs", "user-2");

			await revokeSessions.revokeAllForUser("user-1", NOW);

			expect([...revoked.ids].sort()).toEqual(["laptop", "phone"]);
			expect(await liveFamilies()).toEqual([]);
			expect(await liveFamilies("user-2")).toEqual(["theirs"]);
		});
	});

	describe("RevokeMySession", () => {
		let revoke: RevokeMySession;

		beforeEach(() => {
			revoke = new RevokeMySession(tokens, revokeSessions);
		});

		it("ends the caller's sign-in and marks it, leaving the others", async () => {
			await signIn("phone");
			await signIn("laptop");

			await revoke.run({ userId: "user-1", sessionId: "phone", now: NOW });

			expect(await liveFamilies()).toEqual(["laptop"]);
			expect([...revoked.ids]).toEqual(["phone"]);
		});

		it("answers not found for another user's sign-in and leaves it alive", async () => {
			await signIn("theirs", "user-2");

			await expect(revoke.run({ userId: "user-1", sessionId: "theirs", now: NOW })).rejects.toThrow(
				NotFoundError,
			);
			expect(await liveFamilies("user-2")).toEqual(["theirs"]);
			expect(revoked.ids.size).toBe(0);
		});

		it("answers not found for an unknown or already ended sign-in", async () => {
			await signIn("phone");
			await revoke.run({ userId: "user-1", sessionId: "phone", now: NOW });

			await expect(revoke.run({ userId: "user-1", sessionId: "phone", now: NOW })).rejects.toThrow(
				NotFoundError,
			);
			await expect(revoke.run({ userId: "user-1", sessionId: "nope", now: NOW })).rejects.toThrow(
				NotFoundError,
			);
		});
	});

	describe("RevokeMyOtherSessions", () => {
		let revokeOthers: RevokeMyOtherSessions;

		beforeEach(() => {
			revokeOthers = new RevokeMyOtherSessions(revokeSessions);
		});

		it("keeps the calling sign-in and ends and marks every other one", async () => {
			await signIn("mine");
			await signIn("phone");
			await signIn("laptop");

			await revokeOthers.run({ userId: "user-1", currentSid: "mine", now: NOW });

			expect(await liveFamilies()).toEqual(["mine"]);
			expect([...revoked.ids].sort()).toEqual(["laptop", "phone"]);
		});

		it("ends every sign-in when the calling JWT has no sign-in id", async () => {
			await signIn("mine");
			await signIn("phone");

			await revokeOthers.run({ userId: "user-1", currentSid: null, now: NOW });

			expect(await liveFamilies()).toEqual([]);
		});

		it("does nothing when there is no other sign-in, and can be called twice", async () => {
			await signIn("mine");

			await revokeOthers.run({ userId: "user-1", currentSid: "mine", now: NOW });
			await revokeOthers.run({ userId: "user-1", currentSid: "mine", now: NOW });

			expect(await liveFamilies()).toEqual(["mine"]);
			expect(revoked.ids.size).toBe(0);
		});
	});
});
