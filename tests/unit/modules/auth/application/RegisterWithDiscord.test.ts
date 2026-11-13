import { beforeEach, describe, expect, it } from "bun:test";

import {
	type AccountRegistrar,
	RegisterWithDiscord,
} from "../../../../../src/modules/auth/application/RegisterWithDiscord";
import type { DiscordRegistration } from "../../../../../src/modules/auth/domain/DiscordRegistration";
import { AuthenticationError } from "../../../../../src/shared/errors/AuthenticationError";
import { ConflictError } from "../../../../../src/shared/errors/ConflictError";

const NOW = new Date("2026-11-13T12:00:00Z");
const FORM = {
	id: "user-1",
	ticket: "ticket-1",
	username: "duelist",
	password: "Passw0rd!",
	now: NOW,
};

describe("RegisterWithDiscord", () => {
	let tickets: Map<string, DiscordRegistration>;
	let registered: Parameters<AccountRegistrar["register"]>[0][];
	let rejectWith: Error | null;
	let register: RegisterWithDiscord;

	beforeEach(() => {
		tickets = new Map([["ticket-1", { discordId: "discord-1", email: "duelist@example.com" }]]);
		registered = [];
		rejectWith = null;
		register = new RegisterWithDiscord(
			{
				find: async (ticket) => tickets.get(ticket) ?? null,
				remove: async (ticket) => {
					tickets.delete(ticket);
				},
			},
			{
				register: async (input) => {
					if (rejectWith) throw rejectWith;
					registered.push(input);
					return {
						id: input.id,
						username: input.username,
						email: input.email,
						token: "jwt",
						gamePassword: "Xy3z",
					};
				},
			},
		);
	});

	it("creates the account with the email and Discord account of the ticket", async () => {
		const account = await register.run(FORM);

		expect(account).toEqual({
			id: "user-1",
			username: "duelist",
			email: "duelist@example.com",
			token: "jwt",
			gamePassword: "Xy3z",
		});
		expect(registered).toEqual([
			{
				id: "user-1",
				email: "duelist@example.com",
				username: "duelist",
				password: "Passw0rd!",
				discord: { discordId: "discord-1", emailVerifiedAt: NOW },
			},
		]);
	});

	it("uses the ticket only once", async () => {
		await register.run(FORM);

		await expect(register.run({ ...FORM, id: "user-2", username: "other" })).rejects.toThrow(
			AuthenticationError,
		);
		expect(registered).toHaveLength(1);
	});

	it("rejects an unknown or expired ticket", async () => {
		await expect(register.run({ ...FORM, ticket: "nope" })).rejects.toThrow(AuthenticationError);
		expect(registered).toEqual([]);
	});

	it("keeps the ticket when the username is taken, so the form can be sent again", async () => {
		rejectWith = new ConflictError("username already exists");
		await expect(register.run(FORM)).rejects.toThrow(ConflictError);

		rejectWith = null;
		const account = await register.run({ ...FORM, username: "duelist2" });

		expect(account.username).toBe("duelist2");
		expect(tickets.size).toBe(0);
	});
});
