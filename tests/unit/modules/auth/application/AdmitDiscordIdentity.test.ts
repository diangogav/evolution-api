import { beforeEach, describe, expect, it } from "bun:test";

import { AdmitDiscordIdentity } from "../../../../../src/modules/auth/application/AdmitDiscordIdentity";
import type {
	DiscordAccounts,
	EmailAccount,
} from "../../../../../src/modules/auth/domain/DiscordAccounts";
import type { DiscordIdentity } from "../../../../../src/modules/auth/domain/DiscordIdentity";
import type { DiscordRegistration } from "../../../../../src/modules/auth/domain/DiscordRegistration";

const NOW = new Date("2026-11-13T12:00:00Z");

const IDENTITY: DiscordIdentity = {
	id: "discord-1",
	username: "duelist",
	globalName: "Duelist",
	email: "Duelist@Example.com",
	emailVerified: true,
};

function account(overrides: Partial<EmailAccount> = {}): EmailAccount {
	return {
		id: "user-1",
		username: "player1",
		email: "duelist@example.com",
		discordId: null,
		deleted: false,
		...overrides,
	};
}

class FakeAccounts implements DiscordAccounts {
	byDiscordId = new Map<string, string>();
	byEmail: EmailAccount[] = [];
	links: { userId: string; discordId: string; verifiedAt: Date }[] = [];
	/** Simulates another sign-in linking the account between the lookup and the link. */
	raceWinner: string | null = null;

	async findByDiscordId(discordId: string) {
		const id = this.byDiscordId.get(discordId);
		return id ? { id } : null;
	}

	async findByEmail(email: string) {
		return this.byEmail.filter((row) => row.email.toLowerCase() === email.toLowerCase());
	}

	async link(userId: string, discordId: string, verifiedAt: Date) {
		if (this.raceWinner !== null) {
			if (this.raceWinner === discordId) this.byDiscordId.set(discordId, userId);
			return false;
		}
		this.links.push({ userId, discordId, verifiedAt });
		this.byDiscordId.set(discordId, userId);
		return true;
	}
}

describe("AdmitDiscordIdentity", () => {
	let accounts: FakeAccounts;
	let registrations: DiscordRegistration[];
	let emails: { to: string; data: Record<string, string> }[];
	let failEmail: boolean;
	let admit: AdmitDiscordIdentity;

	beforeEach(() => {
		accounts = new FakeAccounts();
		registrations = [];
		emails = [];
		failEmail = false;
		admit = new AdmitDiscordIdentity(
			accounts,
			{
				save: async (registration) => {
					registrations.push(registration);
					return `ticket-${registrations.length}`;
				},
			},
			{
				send: async (to, data) => {
					if (failEmail) throw new Error("mail provider down");
					emails.push({ to, data });
				},
			},
			{ info: () => undefined, error: () => undefined } as never,
		);
	});

	it("signs in the user already linked to the Discord account", async () => {
		accounts.byDiscordId.set("discord-1", "user-9");

		expect(await admit.run(IDENTITY, NOW)).toEqual({ kind: "login", userId: "user-9" });
		expect(accounts.links).toEqual([]);
		expect(emails).toEqual([]);
	});

	it("signs in a linked user even when Discord sends no verified email", async () => {
		accounts.byDiscordId.set("discord-1", "user-9");

		const admission = await admit.run({ ...IDENTITY, email: null, emailVerified: false }, NOW);

		expect(admission).toEqual({ kind: "login", userId: "user-9" });
	});

	it("links the account that has the verified email, ignoring case, and tells its owner", async () => {
		accounts.byEmail = [account()];

		const admission = await admit.run(IDENTITY, NOW);

		expect(admission).toEqual({ kind: "login", userId: "user-1" });
		expect(accounts.links).toEqual([{ userId: "user-1", discordId: "discord-1", verifiedAt: NOW }]);
		expect(emails).toHaveLength(1);
		expect(emails[0].to).toBe("duelist@example.com");
		expect(emails[0].data.subject).toContain("Discord");
		expect(emails[0].data.text).toContain("Forgot password");
	});

	it("still signs the user in when the notice email cannot be sent", async () => {
		accounts.byEmail = [account()];
		failEmail = true;

		expect(await admit.run(IDENTITY, NOW)).toEqual({ kind: "login", userId: "user-1" });
	});

	it("offers registration when nobody has the Discord account or its email", async () => {
		const admission = await admit.run(IDENTITY, NOW);

		expect(admission).toEqual({ kind: "register", ticket: "ticket-1", username: "duelist" });
		expect(registrations).toEqual([{ discordId: "discord-1", email: "Duelist@Example.com" }]);
		expect(accounts.links).toEqual([]);
	});

	it.each([
		["has no email", { email: null, emailVerified: false }],
		["has an email Discord did not verify", { emailVerified: false }],
	])("refuses a Discord account that %s", async (_label, overrides) => {
		accounts.byEmail = [account()];

		const admission = await admit.run({ ...IDENTITY, ...overrides }, NOW);

		expect(admission).toEqual({ kind: "error", error: "email_unverified" });
		expect(accounts.links).toEqual([]);
		expect(registrations).toEqual([]);
	});

	it.each([
		["already has another Discord account", [account({ discordId: "discord-other" })]],
		["was deleted", [account({ deleted: true })]],
		[
			"shares the address with another account in different case",
			[account(), account({ id: "user-2", email: "DUELIST@example.com" })],
		],
	])("reports a conflict when the account with that email %s", async (_label, rows) => {
		accounts.byEmail = rows;

		const admission = await admit.run(IDENTITY, NOW);

		expect(admission).toEqual({ kind: "error", error: "account_conflict" });
		expect(accounts.links).toEqual([]);
		expect(registrations).toEqual([]);
		expect(emails).toEqual([]);
	});

	it("signs in without a second notice when another sign-in linked the same Discord account first", async () => {
		accounts.byEmail = [account()];
		accounts.raceWinner = "discord-1";

		expect(await admit.run(IDENTITY, NOW)).toEqual({ kind: "login", userId: "user-1" });
		expect(emails).toEqual([]);
	});

	it("reports a conflict when another Discord account won the account in a race", async () => {
		accounts.byEmail = [account()];
		accounts.raceWinner = "discord-other";

		expect(await admit.run(IDENTITY, NOW)).toEqual({ kind: "error", error: "account_conflict" });
	});
});
