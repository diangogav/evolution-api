import { beforeEach, describe, expect, it } from "bun:test";

import { DiscordLinkIntent } from "../../../../../src/modules/auth/application/DiscordLinkIntent";
import { LinkDiscordToUser } from "../../../../../src/modules/auth/application/LinkDiscordToUser";
import { ManageDiscordLink } from "../../../../../src/modules/auth/application/ManageDiscordLink";
import type {
	DiscordAccounts,
	LinkStatus,
} from "../../../../../src/modules/auth/domain/DiscordAccounts";
import type { DiscordIdentity } from "../../../../../src/modules/auth/domain/DiscordIdentity";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";
import { NotFoundError } from "../../../../../src/shared/errors/NotFoundError";
import { JWT } from "../../../../../src/shared/JWT";

const NOW = new Date("2026-11-13T12:00:00Z");
const START_URL = "https://api.example.com/api/v1/auth/discord/start";

const IDENTITY: DiscordIdentity = {
	id: "discord-1",
	username: "duelist",
	globalName: null,
	email: "Duelist@Example.com",
	emailVerified: true,
};

class FakeAccounts implements DiscordAccounts {
	users = new Map<string, LinkStatus>();
	links: { userId: string; discordId: string; verifiedAt: Date | null }[] = [];

	async findByDiscordId(discordId: string) {
		for (const [id, user] of this.users) {
			if (user.discordId === discordId) return { id };
		}
		return null;
	}

	async findByEmail() {
		return [];
	}

	async findLinkStatus(userId: string) {
		return this.users.get(userId) ?? null;
	}

	async link(userId: string, discordId: string, verifiedAt: Date | null) {
		const user = this.users.get(userId);
		if (!user || user.discordId) return false;
		user.discordId = discordId;
		this.links.push({ userId, discordId, verifiedAt });
		return true;
	}

	async unlink(userId: string) {
		const user = this.users.get(userId);
		if (user) user.discordId = null;
	}
}

function user(overrides: Partial<LinkStatus> = {}): LinkStatus {
	return { discordId: null, email: "duelist@example.com", hasPassword: true, ...overrides };
}

describe("LinkDiscordToUser", () => {
	let accounts: FakeAccounts;
	let link: LinkDiscordToUser;

	beforeEach(() => {
		accounts = new FakeAccounts();
		accounts.users.set("user-1", user());
		link = new LinkDiscordToUser(accounts);
	});

	it("links the Discord account and verifies the email when Discord vouches for the same address", async () => {
		expect(await link.run("user-1", IDENTITY, NOW)).toEqual({ linked: true });
		expect(accounts.links).toEqual([{ userId: "user-1", discordId: "discord-1", verifiedAt: NOW }]);
	});

	it.each([
		["uses another address", { email: "other@example.com" }],
		["has an address Discord did not verify", { emailVerified: false }],
		["has no address", { email: null, emailVerified: false }],
	])("links without verifying the email when the Discord account %s", async (_label, overrides) => {
		expect(await link.run("user-1", { ...IDENTITY, ...overrides }, NOW)).toEqual({ linked: true });
		expect(accounts.links[0].verifiedAt).toBeNull();
	});

	it("refuses a Discord account that belongs to another user", async () => {
		accounts.users.set("user-2", user({ discordId: "discord-1", email: "x@example.com" }));

		expect(await link.run("user-1", IDENTITY, NOW)).toEqual({
			linked: false,
			error: "discord_in_use",
		});
		expect(accounts.links).toEqual([]);
	});

	it("refuses a user who already has another Discord account", async () => {
		accounts.users.set("user-1", user({ discordId: "discord-old" }));

		expect(await link.run("user-1", IDENTITY, NOW)).toEqual({
			linked: false,
			error: "already_linked",
		});
	});

	it("reports success when that Discord account is already linked to the same user", async () => {
		accounts.users.set("user-1", user({ discordId: "discord-1" }));

		expect(await link.run("user-1", IDENTITY, NOW)).toEqual({ linked: true });
		expect(accounts.links).toEqual([]);
	});

	it("refuses a user that no longer exists", async () => {
		expect(await link.run("ghost", IDENTITY, NOW)).toEqual({
			linked: false,
			error: "invalid_state",
		});
	});
});

describe("ManageDiscordLink", () => {
	let accounts: FakeAccounts;
	let intents: DiscordLinkIntent;
	let manage: ManageDiscordLink;

	beforeEach(() => {
		accounts = new FakeAccounts();
		intents = new DiscordLinkIntent(new JWT({ issuer: "issuer", secret: "secret" }));
		manage = new ManageDiscordLink(accounts, intents, START_URL);
	});

	it.each([
		["a linked user with a password", user({ discordId: "d" }), { linked: true, canUnlink: true }],
		["an unlinked user", user(), { linked: false, canUnlink: true }],
		[
			"a linked user without a password",
			user({ discordId: "d", hasPassword: false }),
			{ linked: true, canUnlink: false },
		],
	])("describes the link of %s", async (_label, status, expected) => {
		accounts.users.set("user-1", status);

		expect(await manage.status("user-1")).toEqual(expected);
	});

	it("answers not found for a user that does not exist", async () => {
		await expect(manage.status("ghost")).rejects.toThrow(NotFoundError);
		await expect(manage.unlink("ghost")).rejects.toThrow(NotFoundError);
	});

	it("builds the start URL with an intent for the user, the frontend and a safe path", () => {
		const url = new URL(
			manage.begin({ userId: "user-1", origin: "https://evoduel.com", redirect: "//evil" }).url,
		);

		expect(`${url.origin}${url.pathname}`).toBe(START_URL);
		expect(intents.read(url.searchParams.get("link"))).toBe("user-1");
		expect(url.searchParams.get("origin")).toBe("https://evoduel.com");
		expect(url.searchParams.get("redirect")).toBe("/");
	});

	it("unlinks a user who can still sign in with a password", async () => {
		accounts.users.set("user-1", user({ discordId: "d" }));

		await manage.unlink("user-1");

		expect(accounts.users.get("user-1")?.discordId).toBeNull();
	});

	it("does nothing when there is no link to remove", async () => {
		accounts.users.set("user-1", user());

		await manage.unlink("user-1");

		expect(accounts.users.get("user-1")?.discordId).toBeNull();
	});

	it("refuses to unlink a user who has no account password", async () => {
		accounts.users.set("user-1", user({ discordId: "d", hasPassword: false }));

		await expect(manage.unlink("user-1")).rejects.toThrow(ConflictError);
		expect(accounts.users.get("user-1")?.discordId).toBe("d");
	});
});
