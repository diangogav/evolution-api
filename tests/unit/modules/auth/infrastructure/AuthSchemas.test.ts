import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { UserAuth } from "../../../../../src/modules/auth/application/UserAuth";
import { LoginSchema } from "../../../../../src/modules/auth/infrastructure/AuthSchemas";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import { Hash } from "../../../../../src/shared/Hash";
import { JWT } from "../../../../../src/shared/JWT";
import { UserMother } from "../../users/mothers/UserMother";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const hash = new Hash();
const jwt = new JWT({ issuer: "issuer", secret: "secret" });

const loginAs = async (user: User, password: string): Promise<unknown> => {
	const repository: UserRepository = {
		create: async () => undefined,
		findByEmailOrUsername: async () => null,
		findByEmail: async () => user,
		findByUsername: async () => null,
		findById: async () => null,
		update: async () => undefined,
		updateParticipantId: async () => undefined,
		findByParticipantId: async () => null,
	};

	return wire(await new UserAuth(repository, hash, jwt).login({ email: user.email, password }));
};

describe("LoginSchema", () => {
	it("accepts the session of a user signing in with the account password", async () => {
		const user = UserMother.create({
			password: await hash.hash("Ab12"),
			securePassword: await hash.hash("Str0ngPassword"),
		});

		const session = await loginAs(user, "Str0ngPassword");

		expect(Value.Check(LoginSchema, session)).toBe(true);
		expect((session as { mustUpgrade: boolean }).mustUpgrade).toBe(false);
	});

	it("accepts the session of a legacy user signing in with the game password", async () => {
		const user = UserMother.create({ password: await hash.hash("Ab12"), securePassword: null });

		const session = await loginAs(user, "Ab12");

		expect(Value.Check(LoginSchema, session)).toBe(true);
		expect((session as { mustUpgrade: boolean }).mustUpgrade).toBe(true);
	});

	it("rejects a token with a nested user object", () => {
		expect(
			Value.Check(LoginSchema, {
				token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
				user: { id: "user-123", username: "player1", email: "player1@example.com" },
			}),
		).toBe(false);
	});
});
