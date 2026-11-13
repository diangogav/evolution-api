import { beforeEach, describe, expect, it } from "bun:test";

import { EndSession } from "../../../../../src/modules/auth/application/EndSession";
import { RefreshSession } from "../../../../../src/modules/auth/application/RefreshSession";
import {
	hashRefreshToken,
	SessionTokens,
} from "../../../../../src/modules/auth/application/SessionTokens";
import type { User } from "../../../../../src/modules/user/domain/User";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../../src/shared/errors/ForbiddenError";
import { JWT } from "../../../../../src/shared/JWT";
import { UserMother } from "../../users/mothers/UserMother";
import { InMemoryRefreshTokens } from "../InMemoryRefreshTokens";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-13T12:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

describe("refresh tokens", () => {
	let tokens: InMemoryRefreshTokens;
	let sessionTokens: SessionTokens;
	let jwt: JWT;
	let user: User;
	let banned: Set<string>;
	let users: Map<string, User>;
	let refresh: RefreshSession;
	let end: EndSession;

	beforeEach(() => {
		tokens = new InMemoryRefreshTokens();
		sessionTokens = new SessionTokens(tokens);
		jwt = new JWT({ issuer: "issuer", secret: "secret" });
		user = UserMother.create({ id: "user-1", username: "duelist" });
		users = new Map([[user.id, user]]);
		banned = new Set();
		refresh = new RefreshSession(
			tokens,
			sessionTokens,
			{ findById: async (id) => users.get(id) ?? null },
			{ execute: async (userId) => (banned.has(userId) ? { userId } : null) },
			jwt,
			{ info: () => undefined, error: () => undefined } as never,
		);
		end = new EndSession(tokens);
	});

	const signIn = (mustUpgrade = false) =>
		sessionTokens.issue({ userId: "user-1", mustUpgrade, now: NOW });

	describe("SessionTokens", () => {
		it("stores only the hash of the token it hands out, valid for 30 days", async () => {
			const token = await signIn();

			expect(token.length).toBeGreaterThanOrEqual(43);
			expect(tokens.rows).toHaveLength(1);
			expect(tokens.rows[0].tokenHash).toBe(hashRefreshToken(token));
			expect(JSON.stringify(tokens.rows)).not.toContain(token);
			expect(tokens.rows[0].expiresAt).toEqual(later(30 * DAY));
		});

		it("starts a new family per sign-in and issues a different token each time", async () => {
			const first = await signIn();
			const second = await signIn();

			expect(first).not.toBe(second);
			expect(tokens.rows[0].familyId).not.toBe(tokens.rows[1].familyId);
		});

		it("clears the user's expired tokens when it issues a new one", async () => {
			await signIn();

			await sessionTokens.issue({ userId: "user-1", mustUpgrade: false, now: later(31 * DAY) });

			expect(tokens.rows).toHaveLength(1);
			expect(tokens.rows[0].createdAt).toEqual(later(31 * DAY));
		});

		it("adds the refresh token to a session, carrying its must-upgrade flag", async () => {
			const session = await sessionTokens.attach(
				{ id: "user-1", token: "jwt", mustUpgrade: true },
				NOW,
			);

			expect(session).toMatchObject({ id: "user-1", token: "jwt", mustUpgrade: true });
			expect(tokens.rows[0]).toMatchObject({
				tokenHash: hashRefreshToken(session.refreshToken),
				mustUpgrade: true,
			});
		});
	});

	describe("RefreshSession", () => {
		it("returns a new session and a successor token in the same family", async () => {
			const token = await signIn();

			const session = await refresh.run({ refreshToken: token, now: later(DAY) });

			expect(session).toMatchObject({ id: "user-1", username: "duelist", mustUpgrade: false });
			expect(jwt.decode(session.token)).toMatchObject({ id: "user-1", role: user.role });
			expect(session.refreshToken).not.toBe(token);
			expect(tokens.rows).toHaveLength(2);
			expect(tokens.rows[1].familyId).toBe(tokens.rows[0].familyId);
			expect(tokens.rows[1].expiresAt).toEqual(later(31 * DAY));
		});

		it("lets the session be renewed again and again with each successor", async () => {
			let token = await signIn();

			for (let day = 1; day <= 3; day++) {
				token = (await refresh.run({ refreshToken: token, now: later(day * DAY) })).refreshToken;
			}

			expect(tokens.rows).toHaveLength(4);
		});

		it("keeps the must-upgrade flag of the sign-in across renewals", async () => {
			const token = await signIn(true);

			const session = await refresh.run({ refreshToken: token, now: later(DAY) });

			expect(session.mustUpgrade).toBe(true);
			expect(jwt.decode(session.token)).toMatchObject({ mustUpgrade: true });
			expect(tokens.rows[1].mustUpgrade).toBe(true);
		});

		it("revokes the whole sign-in when a used token comes back, so the successor stops working too", async () => {
			const stolen = await signIn();
			const session = await refresh.run({ refreshToken: stolen, now: later(DAY) });

			await expect(refresh.run({ refreshToken: stolen, now: later(2 * DAY) })).rejects.toThrow(
				AuthenticationError,
			);
			await expect(
				refresh.run({ refreshToken: session.refreshToken, now: later(2 * DAY) }),
			).rejects.toThrow(AuthenticationError);
		});

		it("leaves other sign-ins of the same user alone when one is revoked for reuse", async () => {
			const phone = await signIn();
			const laptop = await signIn();
			await refresh.run({ refreshToken: phone, now: later(DAY) });
			await expect(refresh.run({ refreshToken: phone, now: later(2 * DAY) })).rejects.toThrow();

			const session = await refresh.run({ refreshToken: laptop, now: later(2 * DAY) });

			expect(session.id).toBe("user-1");
		});

		it("refuses a second tab renewing a moment later without revoking the sign-in", async () => {
			const token = await signIn();
			const session = await refresh.run({ refreshToken: token, now: later(DAY) });

			await expect(refresh.run({ refreshToken: token, now: later(DAY + 5000) })).rejects.toThrow(
				AuthenticationError,
			);

			const next = await refresh.run({
				refreshToken: session.refreshToken,
				now: later(DAY + 6000),
			});
			expect(next.id).toBe("user-1");
		});

		it("refuses a token after 30 days without use", async () => {
			const token = await signIn();

			await expect(refresh.run({ refreshToken: token, now: later(30 * DAY) })).rejects.toThrow(
				AuthenticationError,
			);
		});

		it("refuses an unknown token", async () => {
			await expect(refresh.run({ refreshToken: "made-up", now: NOW })).rejects.toThrow(
				AuthenticationError,
			);
		});

		it("refuses a banned user and ends that sign-in", async () => {
			const token = await signIn();
			banned.add("user-1");

			await expect(refresh.run({ refreshToken: token, now: later(DAY) })).rejects.toThrow(
				ForbiddenError,
			);

			banned.clear();
			expect(tokens.rows.every((row) => row.revokedAt !== null)).toBe(true);
			expect(tokens.rows).toHaveLength(1);
		});

		it("refuses a token whose user no longer exists", async () => {
			const token = await signIn();
			users.clear();

			await expect(refresh.run({ refreshToken: token, now: later(DAY) })).rejects.toThrow(
				AuthenticationError,
			);
		});

		it("refuses every token of the user once all their sign-ins are revoked", async () => {
			const phone = await signIn();
			const laptop = await signIn();

			await tokens.revokeAllForUser("user-1", later(DAY));

			await expect(refresh.run({ refreshToken: phone, now: later(DAY) })).rejects.toThrow(
				AuthenticationError,
			);
			await expect(refresh.run({ refreshToken: laptop, now: later(DAY) })).rejects.toThrow(
				AuthenticationError,
			);
		});
	});

	describe("EndSession", () => {
		it("ends the sign-in, including a successor already issued", async () => {
			const token = await signIn();
			const session = await refresh.run({ refreshToken: token, now: later(DAY) });

			await end.run({ refreshToken: session.refreshToken, now: later(DAY) });

			await expect(
				refresh.run({ refreshToken: session.refreshToken, now: later(2 * DAY) }),
			).rejects.toThrow(AuthenticationError);
		});

		it("leaves other devices signed in", async () => {
			const phone = await signIn();
			const laptop = await signIn();

			await end.run({ refreshToken: phone, now: NOW });

			expect((await refresh.run({ refreshToken: laptop, now: later(DAY) })).id).toBe("user-1");
		});

		it("does nothing for an unknown token and can be called twice", async () => {
			const token = await signIn();

			await end.run({ refreshToken: "made-up", now: NOW });
			await end.run({ refreshToken: token, now: NOW });
			await end.run({ refreshToken: token, now: NOW });

			expect(tokens.rows[0].revokedAt).toEqual(NOW);
		});
	});
});
