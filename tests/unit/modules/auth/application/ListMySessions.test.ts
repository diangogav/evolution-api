import { beforeEach, describe, expect, it } from "bun:test";

import { ListMySessions } from "../../../../../src/modules/auth/application/ListMySessions";
import { InMemoryRefreshTokens } from "../InMemoryRefreshTokens";

const NOW = new Date("2026-11-27T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);
const CHROME_ANDROID =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

describe("ListMySessions", () => {
	let tokens: InMemoryRefreshTokens;
	let list: ListMySessions;
	let serial: number;

	beforeEach(() => {
		tokens = new InMemoryRefreshTokens();
		list = new ListMySessions(tokens);
		serial = 0;
	});

	const token = async (
		familyId: string,
		createdAt: Date,
		overrides: { userId?: string; userAgent?: string | null; signedInAt?: Date } = {},
	) => {
		serial++;
		await tokens.save({
			id: `token-${serial}`,
			userId: overrides.userId ?? "user-1",
			familyId,
			tokenHash: `hash-${serial}`,
			mustUpgrade: false,
			createdAt,
			expiresAt: new Date(createdAt.getTime() + 30 * 24 * HOUR),
			userAgent: overrides.userAgent ?? null,
			signedInAt: overrides.signedInAt ?? createdAt,
		});
		return tokens.rows[tokens.rows.length - 1];
	};

	it("lists one entry per active sign-in, described by its newest token", async () => {
		const first = await token("family-a", ago(48), { userAgent: CHROME_ANDROID });
		first.usedAt = ago(2);
		await token("family-a", ago(2), { userAgent: CHROME_ANDROID, signedInAt: ago(48) });

		const sessions = await list.run({ userId: "user-1", currentSid: null, now: NOW });

		expect(sessions).toEqual([
			{
				id: "family-a",
				browser: "Chrome",
				os: "Android",
				signedInAt: ago(48),
				lastUsedAt: ago(2),
				current: false,
			},
		]);
	});

	it("leaves out revoked and expired sign-ins and other users' sign-ins", async () => {
		(await token("revoked", ago(1))).revokedAt = ago(0.5);
		await token("expired", ago(31 * 24));
		await token("someone-else", ago(1), { userId: "user-2" });
		await token("active", ago(1));

		const sessions = await list.run({ userId: "user-1", currentSid: null, now: NOW });

		expect(sessions.map((session) => session.id)).toEqual(["active"]);
	});

	it("marks the calling sign-in and lists it first, then the most recently used", async () => {
		await token("old", ago(10));
		await token("recent", ago(1));
		await token("mine", ago(5));

		const sessions = await list.run({ userId: "user-1", currentSid: "mine", now: NOW });

		expect(sessions.map((session) => [session.id, session.current])).toEqual([
			["mine", true],
			["recent", false],
			["old", false],
		]);
	});

	it("marks none as current for a token without a sign-in id", async () => {
		await token("family-a", ago(1));

		const sessions = await list.run({ userId: "user-1", currentSid: null, now: NOW });

		expect(sessions.every((session) => !session.current)).toBe(true);
	});
});
