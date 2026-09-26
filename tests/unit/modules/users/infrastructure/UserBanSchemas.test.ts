import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { UserBanUser } from "../../../../../src/modules/user/application/UserBanUser";
import { UserGetActiveBan } from "../../../../../src/modules/user/application/UserGetActiveBan";
import { UserGetBanHistory } from "../../../../../src/modules/user/application/UserGetBanHistory";
import { UserUnbanUser } from "../../../../../src/modules/user/application/UserUnbanUser";
import { UserBan } from "../../../../../src/modules/user/domain/UserBan";
import { UserBanRepository } from "../../../../../src/modules/user/domain/UserBanRepository";
import {
	ActiveBanSchema,
	BanActionSchema,
	BanHistorySchema,
} from "../../../../../src/modules/user/infrastructure/UserBanSchemas";
import { UserBanMother } from "../mothers/UserBanMother";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

// Models what UserBanPostgresRepository actually reads back: `expiresAt` is
// `null` for a permanent ban, never `undefined`.
const persistedBan = (overrides: Partial<UserBan> = {}): UserBan =>
	({ ...UserBanMother.create(), expiresAt: null, ...overrides }) as unknown as UserBan;

const repositoryWith = (overrides: Partial<UserBanRepository> = {}): UserBanRepository => ({
	banUser: async () => undefined,
	findActiveBanByUserId: async () => null,
	unbanUser: async () => undefined,
	getBansByUserId: async () => [],
	finishActiveBan: async () => undefined,
	...overrides,
});

describe("BanActionSchema", () => {
	it("accepts the literal success UserBanUser and UserUnbanUser answer with", async () => {
		const banResult = wire(
			await new UserBanUser(repositoryWith())
				.execute({ userId: "user-1", reason: "cheating", bannedBy: "admin-1" })
				.then(() => ({ success: true })),
		);
		const unbanResult = wire(
			await new UserUnbanUser(repositoryWith()).execute("user-1").then(() => ({ success: true })),
		);

		expect(Value.Check(BanActionSchema, banResult)).toBe(true);
		expect(Value.Check(BanActionSchema, unbanResult)).toBe(true);
		expect(Value.Check(BanActionSchema, { success: false })).toBe(false);
	});
});

describe("ActiveBanSchema", () => {
	it("accepts the active ban UserGetActiveBan returns, including a null expiresAt", async () => {
		const ban = persistedBan();
		const repository = repositoryWith({ findActiveBanByUserId: async () => ban });

		const activeBan = await new UserGetActiveBan(repository).execute("user-1");

		expect(Value.Check(ActiveBanSchema, wire({ activeBan }))).toBe(true);
	});

	it("accepts null when the user is not currently banned", async () => {
		const repository = repositoryWith({ findActiveBanByUserId: async () => null });

		const activeBan = await new UserGetActiveBan(repository).execute("user-1");

		expect(Value.Check(ActiveBanSchema, wire({ activeBan }))).toBe(true);
	});

	it("rejects a ban record missing the audit fields Postgres always returns", () => {
		expect(
			Value.Check(ActiveBanSchema, {
				activeBan: { id: "ban-1", reason: "cheating", bannedAt: "2025-11-24T10:00:00Z" },
			}),
		).toBe(false);
	});
});

describe("BanHistorySchema", () => {
	it("accepts the ban history UserGetBanHistory returns, oldest and newest bans alike", async () => {
		const bans = [persistedBan(), persistedBan({ expiresAt: "2025-12-24T10:00:00Z" as never })];
		const repository = repositoryWith({ getBansByUserId: async () => bans });

		const history = await new UserGetBanHistory(repository).execute("user-1");

		expect(Value.Check(BanHistorySchema, wire({ history }))).toBe(true);
	});

	it("rejects the wrong isActive/unbannedAt shape once documented for this route", () => {
		expect(
			Value.Check(BanHistorySchema, {
				history: [
					{
						id: "ban-123",
						reason: "Inappropriate behavior",
						bannedAt: "2025-11-24T10:00:00Z",
						unbannedAt: "2025-11-25T10:00:00Z",
						isActive: false,
					},
				],
			}),
		).toBe(false);
	});
});
