import { bearer } from "@elysiajs/bearer";
import { randomUUID } from "crypto";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { UserAuth } from "../../modules/auth/application/UserAuth";
import { LoginSchema } from "../../modules/auth/infrastructure/AuthSchemas";
import { MatchesGetter } from "../../modules/match/application/MatchesGetter";
import { UserMatchesSchema } from "../../modules/match/infrastructure/MatchSchemas";
import { MatchPostgresRepository } from "../../modules/match/infrastructure/MatchPostgresRepository";
import { UserStatsFinder } from "../../modules/stats/application/UserStatsFinder";
import { UserStatsSchema } from "../../modules/stats/infrastructure/StatsSchemas";
import { UserStatsPostgresRepository } from "../../modules/stats/infrastructure/UserStatsPostgresRepository";
import { TierResolver } from "../../modules/tiers/application/TierResolver";
import { TiersPostgresRepository } from "../../modules/tiers/infrastructure/TiersPostgresRepository";
import { UserForgotPassword } from "../../modules/user/application/UserForgotPassword";
import { UserGamePasswordGenerator } from "../../modules/user/application/UserGamePasswordGenerator";
import { UserRegister } from "../../modules/user/application/UserRegister";
import { UserAccountPasswordReset } from "../../modules/user/application/UserAccountPasswordReset";
import { UserAccountPasswordUpdater } from "../../modules/user/application/UserAccountPasswordUpdater";
import { UserUpgradePassword } from "../../modules/user/application/UserUpgradePassword";
import { UserTokenValidator } from "../../modules/user/application/UserTokenValidator";
import { UserUsernameUpdater } from "../../modules/user/application/UserUsernameUpdater";
import { UserUsernameAvailabilityChecker } from "../../modules/user/application/UserUsernameAvailabilityChecker";
import { ResetPasswordLinkBuilder } from "../../modules/user/domain/ResetPasswordLinkBuilder";
import { UserPostgresRepository } from "../../modules/user/infrastructure/UserPostgresRepository";
import {
	AccountPasswordResetSchema,
	GamePasswordSchema,
	PasswordResetRequestSchema,
	PasswordUpgradeSchema,
	RegisteredUserSchema,
	TokenValidationSchema,
	UsernameAvailabilitySchema,
} from "../../modules/user/infrastructure/UserSchemas";
import { ResendEmailSender } from "../../shared/email/infrastructure/ResendEmailSender";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { Hash } from "../../shared/Hash";
import { JWT } from "../../shared/JWT";
import { Pino } from "../../shared/logger/infrastructure/Pino";
import { emptyOk, errorResponses, jsonOk } from "../openapi/responses";
import { UserBanPostgresRepository } from "../../modules/user/infrastructure/UserBanPostgresRepository";
import { UserBanUser } from "../../modules/user/application/UserBanUser";
import { UserUnbanUser } from "../../modules/user/application/UserUnbanUser";
import { UserGetActiveBan } from "../../modules/user/application/UserGetActiveBan";
import { UserGetBanHistory } from "../../modules/user/application/UserGetBanHistory";
import { ForbiddenError } from "../../shared/errors/ForbiddenError";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import { banGuard } from "../guards/bandGuard";

const logger = new Pino();
const emailSender = new ResendEmailSender();
const userRepository = new UserPostgresRepository();
const userStatsRepository = new UserStatsPostgresRepository();
const tierResolver = new TierResolver(new TiersPostgresRepository());
const matchRepository = new MatchPostgresRepository();
const hash = new Hash();
const jwt = new JWT(config.jwt);
const userBanRepository = new UserBanPostgresRepository();
const resetPasswordLinkBuilder = new ResetPasswordLinkBuilder(
	config.passwordRecovery.frontends,
	config.passwordRecovery.defaultResetUrl,
);

export const userRouter = new Elysia({ prefix: "/users" })
	// Public Endpoints
	.post(
		"/register",
		async ({ body }) => {
			const id = randomUUID();
			return new UserRegister(userRepository, hash, logger, emailSender, jwt).register({
				...body,
				id,
			});
		},
		{
			detail: {
				tags: ["Authentication"],
				summary: "Register new user",
				description: "Creates a new user account with a strong password and sends a welcome email",
				responses: {
					200: jsonOk(RegisteredUserSchema, "User registered successfully", {
						id: "5b2c0e9e-7a4f-4c3b-9d1e-2f6a8b0c4d3e",
						username: "player1",
						email: "player1@example.com",
						token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
						gamePassword: "Xy3z",
					}),
					...errorResponses(400, 409, 422),
				},
			},
			body: t.Object({
				username: t.String({ minLength: 1, maxLength: 14, pattern: "^.*\\S.*$" }),
				email: t.String({ minLength: 1, pattern: "^.*\\S.*$" }),
				password: t.String({ minLength: 1, pattern: "^.*\\S.*$" }),
			}),
		},
	)
	.post(
		"/login",
		async ({ body }) => {
			return new UserAuth(userRepository, hash, jwt).login(body);
		},
		{
			detail: {
				tags: ["Authentication"],
				summary: "User login",
				description: "Authenticates a user and returns a JWT token",
				responses: {
					200: jsonOk(LoginSchema, "Login successful", {
						id: "user-123",
						token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
						username: "player1",
						mustUpgrade: false,
					}),
					...errorResponses(401, 422),
				},
			},
			body: t.Object({
				email: t.String({ minLength: 1, pattern: "^.*\\S.*$" }),
				password: t.String({ minLength: 1, pattern: "^.*\\S.*$" }),
			}),
		},
	)
	.post(
		"/forgot-password",
		async ({ body, request }) => {
			return new UserForgotPassword(
				userRepository,
				emailSender,
				jwt,
				logger,
				resetPasswordLinkBuilder,
			).forgotPassword({
				...body,
				origin: request.headers.get("origin"),
				referer: request.headers.get("referer"),
			});
		},
		{
			detail: {
				tags: ["Authentication"],
				summary: "Request password reset",
				description: "Sends a password reset email to the user",
				responses: {
					200: jsonOk(
						PasswordResetRequestSchema,
						"Request accepted; the same answer is sent for unregistered emails",
						{ message: "Email sent successfully" },
					),
					...errorResponses(422),
				},
			},
			body: t.Object({
				email: t.String({ minLength: 1, pattern: "^.*\\S.*$" }),
			}),
		},
	)
	.get(
		"/validate-token",
		async ({ query }) => {
			return new UserTokenValidator(userRepository, jwt, logger).validateToken({
				token: query.token,
			});
		},
		{
			detail: {
				tags: ["Authentication"],
				summary: "Validate reset token",
				description: "Validates a password reset token",
				responses: {
					200: jsonOk(TokenValidationSchema, "Token is valid", { valid: true, userId: "user-123" }),
					...errorResponses(401, 422),
				},
			},
			query: t.Object({
				token: t.String(),
			}),
		},
	)
	.get(
		"/username-availability",
		async ({ query }) => {
			return new UserUsernameAvailabilityChecker(userRepository).check({
				username: query.username,
			});
		},
		{
			detail: {
				tags: ["User Management"],
				summary: "Check username availability",
				description:
					"Checks whether a username is available so the frontend can validate it before submitting a change or registration",
				responses: {
					200: jsonOk(UsernameAvailabilitySchema, "Availability resolved successfully", {
						available: true,
					}),
					...errorResponses(422),
				},
			},
			query: t.Object({
				username: t.String({ minLength: 1, maxLength: 14, pattern: "^.*\\S.*$" }),
			}),
		},
	)
	.post(
		"/reset-account-password",
		async ({ body, headers }) => {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) {
				throw new AuthenticationError("No token provided");
			}
			return new UserAccountPasswordReset(
				userRepository,
				hash,
				emailSender,
				logger,
				jwt,
			).resetPassword({
				token,
				newPassword: body.password,
			});
		},
		{
			detail: {
				tags: ["Authentication"],
				summary: "Reset account password",
				description: "Resets the strong account password using a valid reset token",
				security: [{ bearerAuth: [] }],
				responses: {
					200: jsonOk(
						AccountPasswordResetSchema,
						"Account password reset successfully; returns a fresh session for auto-login",
						{
							id: "user-123",
							username: "player1",
							token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
							migrated: true,
						},
					),
					...errorResponses(400, 401, 404, 422),
				},
			},
			body: t.Object({
				password: t.String({ minLength: 1 }),
			}),
		},
	)
	.get(
		"/:userId/stats",
		async ({ query, params }) => {
			const banListName = query.banListName;
			const season = query.season;
			const userId = params.userId;
			return new UserStatsFinder(userStatsRepository, tierResolver).find({
				banListName,
				userId,
				season,
			});
		},
		{
			detail: {
				tags: ["User Management"],
				summary: "Get user statistics",
				description:
					"Retrieves user statistics for a specific ban list and season. Each ratings[] entry carries its live ranked tier (see TierViewSchema); tier is null for ranks without a ladder, such as Global.",
				responses: {
					200: jsonOk(UserStatsSchema, "Statistics retrieved successfully", {
						userId: "user-123",
						username: "player1",
						points: 62,
						wins: 34,
						losses: 21,
						winRate: 61.82,
						position: "12",
						achievements: [],
						ratings: [
							{
								banListName: "TCG",
								rating: 1180,
								gamesPlayed: 34,
								peak: 1210,
								provisional: false,
								rankType: "banlist",
								tier: {
									id: "gold",
									name: "Gold",
									effectivePoints: 17,
									gamesPlayed: 34,
									progress: {
										nextTierId: "platinum",
										unit: "points",
										current: 17,
										target: 25,
										distinctOpponentWins: { current: 4, required: 5 },
									},
								},
							},
							{
								banListName: "Global",
								rating: 1150,
								gamesPlayed: 55,
								peak: 1190,
								provisional: false,
								rankType: "global",
								tier: null,
							},
						],
					}),
					...errorResponses(404, 422),
				},
			},
			query: t.Object({
				banListName: t.String({ default: "Global" }),
				season: t.Number({ default: config.season }),
			}),
			params: t.Object({
				userId: t.String(),
			}),
		},
	)
	.get(
		"/:userId/matches",
		async ({ query, params }) => {
			const banListName = query.banListName;
			const userId = params.userId;
			const limit = query.limit;
			const page = query.page;
			const season = query.season;
			return new MatchesGetter(matchRepository).get({ banListName, userId, limit, page, season });
		},
		{
			detail: {
				tags: ["User Management"],
				summary: "Get user matches",
				description:
					"Retrieves one page of the user's match history for a season, newest first, as a bare array. Annulled matches are included and flagged.",
				responses: {
					200: jsonOk(UserMatchesSchema, "Matches retrieved successfully", [
						{
							userId: "user-123",
							bestOf: 3,
							banListName: "Edison",
							playerNames: ["player1"],
							opponentNames: ["player2"],
							playerScore: 2,
							opponentScore: 1,
							points: 3,
							winner: true,
							date: "2026-09-20T18:30:00.000Z",
							season: 7,
							anulled: false,
							anulledReason: null,
						},
					]),
					...errorResponses(422),
				},
			},
			query: t.Object({
				page: t.Number({ default: 1, minimum: 1 }),
				limit: t.Number({ default: 100, maximum: 100 }),
				banListName: t.Optional(t.String()),
				season: t.Number({ default: config.season, minimum: 1 }),
			}),
			params: t.Object({
				userId: t.String(),
			}),
		},
	)

	// Authenticated Endpoints protected by banGuard
	.use(bearer())
	.guard(banGuard, (app) =>
		app
			.post(
				"/change-username",
				async ({ body, bearer }) => {
					const { id } = jwt.decode(bearer as string) as { id: string };
					return new UserUsernameUpdater(userRepository).updateUsername({
						...(body as { username: string }),
						id,
					});
				},
				{
					detail: {
						tags: ["User Management"],
						summary: "Change username",
						description: "Changes the username for the authenticated user",
						security: [{ bearerAuth: [] }],
						responses: {
							200: emptyOk("Username changed successfully"),
							...errorResponses(401, 403, 404, 409, 422),
						},
					},
					body: t.Object({
						username: t.String({ minLength: 1, maxLength: 14, pattern: "^.*\\S.*$" }),
					}),
				},
			)
			.post(
				"/game-password",
				async ({ bearer }) => {
					const { id } = jwt.decode(bearer as string) as { id: string };
					return new UserGamePasswordGenerator(userRepository, hash).generate({ userId: id });
				},
				{
					detail: {
						tags: ["User Management"],
						summary: "Generate game password",
						description:
							"Regenerates the 4-character game password used to connect through other ygopro clients and returns it once",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(GamePasswordSchema, "Game password generated successfully", {
								gamePassword: "Xy3z",
							}),
							...errorResponses(401, 403, 404),
						},
					},
				},
			)
			.post(
				"/upgrade-password",
				async ({ body, bearer }) => {
					const { id } = jwt.decode(bearer as string) as { id: string };
					return new UserUpgradePassword(userRepository, hash, jwt).upgrade({
						...(body as { password: string }),
						userId: id,
					});
				},
				{
					detail: {
						tags: ["Authentication"],
						summary: "Set account password (upgrade)",
						description:
							"Sets the strong account password for a user that signed in with mustUpgrade, and returns a fresh token",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(PasswordUpgradeSchema, "Account password set; returns a fresh session", {
								id: "user-123",
								token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
								username: "player1",
							}),
							...errorResponses(400, 401, 403, 404, 409, 422),
						},
					},
					body: t.Object({
						password: t.String({ minLength: 1 }),
					}),
				},
			)
			.post(
				"/change-account-password",
				async ({ body, bearer }) => {
					const { id } = jwt.decode(bearer as string) as { id: string };
					return new UserAccountPasswordUpdater(
						userRepository,
						hash,
						logger,
						emailSender,
					).updatePassword({
						...(body as { currentPassword: string; newPassword: string }),
						id,
					});
				},
				{
					detail: {
						tags: ["Authentication"],
						summary: "Change account password",
						description:
							"Changes the strong account password of the authenticated user, verifying the current one",
						security: [{ bearerAuth: [] }],
						responses: {
							200: emptyOk("Account password changed successfully"),
							...errorResponses(400, 401, 403, 404, 422),
						},
					},
					body: t.Object({
						currentPassword: t.String({ minLength: 1 }),
						newPassword: t.String({ minLength: 1 }),
					}),
				},
			),
	)

	// Admin Endpoints (NOT protected by banGuard)
	.post(
		"/:userId/ban",
		async ({ params, body, bearer }) => {
			const { id: adminId, role } = jwt.decode(bearer as string) as { id: string; role: string };
			if (role !== UserProfileRole.ADMIN) {
				throw new ForbiddenError("You do not have permission to ban users");
			}
			await new UserBanUser(userBanRepository).execute({
				userId: params.userId,
				reason: body.reason,
				bannedBy: adminId,
				expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
			});
			return { success: true };
		},
		{
			detail: {
				tags: ["User Bans"],
				summary: "Ban user",
				description:
					"Bans a user with a reason and optional expiration date. Requires admin privileges.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: {
						description: "User banned successfully",
						content: {
							"application/json": {
								example: { success: true },
							},
						},
					},
					401: { description: "Unauthorized - Missing or invalid token" },
					403: { description: "Forbidden - Admin role required" },
					404: { description: "User not found" },
				},
			},
			params: t.Object({ userId: t.String() }),
			body: t.Object({
				reason: t.String({ minLength: 1 }),
				expiresAt: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/:userId/unban",
		async ({ params, bearer }) => {
			const { role } = jwt.decode(bearer as string) as { id: string; role: string };
			if (role !== UserProfileRole.ADMIN) {
				throw new ForbiddenError("You do not have permissions to unban users");
			}
			await new UserUnbanUser(userBanRepository).execute(params.userId);
			return { success: true };
		},
		{
			detail: {
				tags: ["User Bans"],
				summary: "Unban user",
				description: "Removes an active ban from a user. Requires admin privileges.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: {
						description: "User unbanned successfully",
						content: {
							"application/json": {
								example: { success: true },
							},
						},
					},
					401: { description: "Unauthorized - Missing or invalid token" },
					403: { description: "Forbidden - Admin role required" },
					404: { description: "User or ban not found" },
				},
			},
			params: t.Object({ userId: t.String() }),
		},
	)

	// Query Endpoints (now ADMIN only)
	.get(
		"/:userId/ban/active",
		async ({ params, bearer }) => {
			const { role } = jwt.decode(bearer as string) as { id: string; role: string };
			if (role !== UserProfileRole.ADMIN) {
				throw new ForbiddenError("You do not have permission to view bans");
			}
			const ban = await new UserGetActiveBan(userBanRepository).execute(params.userId);
			return { activeBan: ban };
		},
		{
			detail: {
				tags: ["User Bans"],
				summary: "Get active ban",
				description:
					"Retrieves the ban currently in force for a user, or null when the user is not banned. Requires admin privileges.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: {
						description: "Active ban retrieved successfully",
						content: {
							"application/json": {
								example: {
									activeBan: {
										id: "ban-123",
										userId: "user-123",
										reason: "Inappropriate behavior",
										bannedAt: "2025-11-24T10:00:00Z",
										expiresAt: "2025-12-24T10:00:00Z",
										bannedBy: "admin-1",
										createdAt: "2025-11-24T10:00:00Z",
										updatedAt: "2025-11-24T10:00:00Z",
									},
								},
							},
						},
					},
					401: { description: "Unauthorized - Missing or invalid token" },
					403: { description: "Forbidden - Admin role required" },
				},
			},
			params: t.Object({ userId: t.String() }),
		},
	)
	.get(
		"/:userId/ban/history",
		async ({ params, bearer }) => {
			const { role } = jwt.decode(bearer as string) as { id: string; role: string };
			if (role !== UserProfileRole.ADMIN) {
				throw new ForbiddenError("You do not have permission to view ban history");
			}
			const bans = await new UserGetBanHistory(userBanRepository).execute(params.userId);
			return { history: bans };
		},
		{
			detail: {
				tags: ["User Bans"],
				summary: "Get ban history",
				description: "Retrieves the complete ban history for a user. Requires admin privileges.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: {
						description: "Ban history retrieved successfully",
						content: {
							"application/json": {
								example: {
									history: [
										{
											id: "ban-123",
											reason: "Inappropriate behavior",
											bannedAt: "2025-11-24T10:00:00Z",
											unbannedAt: "2025-11-25T10:00:00Z",
											isActive: false,
										},
									],
								},
							},
						},
					},
					401: { description: "Unauthorized - Missing or invalid token" },
					403: { description: "Forbidden - Admin role required" },
					404: { description: "User not found" },
				},
			},
			params: t.Object({ userId: t.String() }),
		},
	);
