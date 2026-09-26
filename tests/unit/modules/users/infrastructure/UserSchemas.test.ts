import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { UserAccountPasswordReset } from "../../../../../src/modules/user/application/UserAccountPasswordReset";
import { UserForgotPassword } from "../../../../../src/modules/user/application/UserForgotPassword";
import { UserGamePasswordGenerator } from "../../../../../src/modules/user/application/UserGamePasswordGenerator";
import { UserRegister } from "../../../../../src/modules/user/application/UserRegister";
import { UserTokenValidator } from "../../../../../src/modules/user/application/UserTokenValidator";
import { UserUpgradePassword } from "../../../../../src/modules/user/application/UserUpgradePassword";
import { UserUsernameAvailabilityChecker } from "../../../../../src/modules/user/application/UserUsernameAvailabilityChecker";
import { ResetPasswordLinkBuilder } from "../../../../../src/modules/user/domain/ResetPasswordLinkBuilder";
import { User } from "../../../../../src/modules/user/domain/User";
import { UserRepository } from "../../../../../src/modules/user/domain/UserRepository";
import {
	AccountPasswordResetSchema,
	GamePasswordSchema,
	PasswordResetRequestSchema,
	PasswordUpgradeSchema,
	RegisteredUserSchema,
	TokenValidationSchema,
	UsernameAvailabilitySchema,
} from "../../../../../src/modules/user/infrastructure/UserSchemas";
import { Hash } from "../../../../../src/shared/Hash";
import { JWT } from "../../../../../src/shared/JWT";
import { Pino } from "../../../../../src/shared/logger/infrastructure/Pino";
import { UserMother } from "../mothers/UserMother";

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const hash = new Hash();
const jwt = new JWT({ issuer: "issuer", secret: "secret" });
const logger = new Pino();
const emailSender = { send: async () => undefined };
const linkBuilder = new ResetPasswordLinkBuilder([], "https://evolutionygo.com/reset-password");

const repositoryWith = (user: User | null): UserRepository => ({
	create: async () => undefined,
	findByEmailOrUsername: async () => null,
	findByEmail: async () => user,
	findByUsername: async () => user,
	findById: async () => user,
	update: async () => undefined,
	updateParticipantId: async () => undefined,
	findByParticipantId: async () => null,
});

const legacyUser = UserMother.create({ securePassword: null });

describe("RegisteredUserSchema", () => {
	it("accepts the new account UserRegister returns, including its one-time game password", async () => {
		const registered = wire(
			await new UserRegister(repositoryWith(null), hash, logger, emailSender, jwt).register({
				id: "user-1",
				email: "player1@example.com",
				username: "player1",
				password: "Str0ngPassword",
			}),
		);

		expect(Value.Check(RegisteredUserSchema, registered)).toBe(true);
		const { gamePassword: _omitted, ...withoutGamePassword } = registered as Record<
			string,
			unknown
		>;
		expect(Value.Check(RegisteredUserSchema, withoutGamePassword)).toBe(false);
	});
});

describe("PasswordResetRequestSchema", () => {
	it("accepts the same message whether or not the email is registered", async () => {
		const forgotPassword = (user: User | null) =>
			new UserForgotPassword(repositoryWith(user), emailSender, jwt, logger, linkBuilder)
				.forgotPassword({ email: "player1@example.com" })
				.then(wire);

		expect(Value.Check(PasswordResetRequestSchema, await forgotPassword(legacyUser))).toBe(true);
		expect(Value.Check(PasswordResetRequestSchema, await forgotPassword(null))).toBe(true);
	});
});

describe("TokenValidationSchema", () => {
	it("accepts the user id UserTokenValidator returns, not an email", async () => {
		const validation = wire(
			await new UserTokenValidator(repositoryWith(legacyUser), jwt, logger).validateToken({
				token: jwt.generate({ id: legacyUser.id }),
			}),
		);

		expect(Value.Check(TokenValidationSchema, validation)).toBe(true);
		expect(Value.Check(TokenValidationSchema, { valid: true, email: legacyUser.email })).toBe(
			false,
		);
	});
});

describe("UsernameAvailabilitySchema", () => {
	it("accepts both answers of UserUsernameAvailabilityChecker", async () => {
		const check = (user: User | null) =>
			new UserUsernameAvailabilityChecker(repositoryWith(user))
				.check({ username: "player1" })
				.then(wire);

		expect(Value.Check(UsernameAvailabilitySchema, await check(null))).toBe(true);
		expect(Value.Check(UsernameAvailabilitySchema, await check(legacyUser))).toBe(true);
	});
});

describe("AccountPasswordResetSchema", () => {
	it("accepts the fresh session UserAccountPasswordReset returns", async () => {
		const session = wire(
			await new UserAccountPasswordReset(
				repositoryWith(legacyUser),
				hash,
				emailSender,
				logger,
				jwt,
			).resetPassword({
				token: jwt.generate({ id: legacyUser.id }),
				newPassword: "Str0ngPassword",
			}),
		);

		expect(Value.Check(AccountPasswordResetSchema, session)).toBe(true);
	});
});

describe("GamePasswordSchema", () => {
	it("accepts the 4-character password UserGamePasswordGenerator returns", async () => {
		const generated = wire(
			await new UserGamePasswordGenerator(repositoryWith(legacyUser), hash).generate({
				userId: legacyUser.id,
			}),
		);

		expect(Value.Check(GamePasswordSchema, generated)).toBe(true);
		expect(Value.Check(GamePasswordSchema, { gamePassword: "toolong" })).toBe(false);
	});
});

describe("PasswordUpgradeSchema", () => {
	it("accepts the fresh session UserUpgradePassword returns", async () => {
		const session = wire(
			await new UserUpgradePassword(repositoryWith(legacyUser), hash, jwt).upgrade({
				userId: legacyUser.id,
				password: "Str0ngPassword",
			}),
		);

		expect(Value.Check(PasswordUpgradeSchema, session)).toBe(true);
	});
});
