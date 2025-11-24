import { bearer } from "@elysiajs/bearer";
import { randomUUID } from "crypto";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { UserAuth } from "../../modules/auth/application/UserAuth";
import { MatchesGetter } from "../../modules/match/application/MatchesGetter";
import { MatchPostgresRepository } from "../../modules/match/infrastructure/MatchPostgresRepository";
import { UserStatsFinder } from "../../modules/stats/application/UserStatsFinder";
import { UserStatsPostgresRepository } from "../../modules/stats/infrastructure/UserStatsPostgresRepository";
import { UserForgotPassword } from "../../modules/user/application/UserForgotPassword";
import { UserPasswordReset } from "../../modules/user/application/UserPasswordReset";
import { UserPasswordUpdater } from "../../modules/user/application/UserPasswordUpdater";
import { UserRegister } from "../../modules/user/application/UserRegister";
import { UserTokenValidator } from "../../modules/user/application/UserTokenValidator";
import { UserUsernameUpdater } from "../../modules/user/application/UserUsernameUpdater";
import { UserPostgresRepository } from "../../modules/user/infrastructure/UserPostgresRepository";
import { ResendEmailSender } from "../../shared/email/infrastructure/ResendEmailSender";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { Hash } from "../../shared/Hash";
import { JWT } from "../../shared/JWT";
import { Pino } from "../../shared/logger/infrastructure/Pino";
import { UserBanPostgresRepository } from "../../modules/user/infrastructure/UserBanPostgresRepository";
import { UserBanUser } from "../../modules/user/application/UserBanUser";
import { UserUnbanUser } from "../../modules/user/application/UserUnbanUser";
import { UserGetActiveBan } from "../../modules/user/application/UserGetActiveBan";
import { UserGetBanHistory } from "../../modules/user/application/UserGetBanHistory";
import { UnauthorizedError } from "../../shared/errors/UnauthorizedError";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import { banGuard } from "../guards/bandGuard";

const logger = new Pino();
const emailSender = new ResendEmailSender();
const userRepository = new UserPostgresRepository();
const userStatsRepository = new UserStatsPostgresRepository();
const matchRepository = new MatchPostgresRepository();
const hash = new Hash();
const jwt = new JWT(config.jwt);
const userBanRepository = new UserBanPostgresRepository();

export const userRouter = new Elysia({ prefix: "/users" })
	// Public Endpoints
	.post(
		"/register",
		async ({ body }) => {
			const id = randomUUID();
			return new UserRegister(userRepository, hash, logger, emailSender).register({ ...body, id });
		},
		{
			detail: {
				tags: ['Authentication'],
				summary: 'Register new user',
				description: 'Creates a new user account and sends verification email',
				responses: {
					200: {
						description: 'User registered successfully',
						content: {
							'application/json': {
								example: {
									id: 'uuid-123',
									username: 'player1',
									email: 'player1@example.com'
								}
							}
						}
					},
					409: { description: 'User already exists' }
				}
			},
			body: t.Object({
				username: t.String({ minLength: 1, maxLength: 14, pattern: '^.*\\S.*$' }),
				email: t.String({ minLength: 1, pattern: '^.*\\S.*$' }),
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
				tags: ['Authentication'],
				summary: 'User login',
				description: 'Authenticates a user and returns a JWT token',
				responses: {
					200: {
						description: 'Login successful',
						content: {
							'application/json': {
								example: {
									token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
									user: {
										id: 'user-123',
										username: 'player1',
										email: 'player1@example.com'
									}
								}
							}
						}
					},
					401: { description: 'Invalid credentials' }
				}
			},
			body: t.Object({
				email: t.String({ minLength: 1, pattern: '^.*\\S.*$' }),
				password: t.String({ minLength: 1, pattern: '^.*\\S.*$' }),
			}),
		},
	)
	.post(
		"/forgot-password",
		async ({ body, request }) => {
			const baseUrl = request.headers.get("origin") || request.headers.get("referer") || "";
			return new UserForgotPassword(userRepository, emailSender, jwt, logger, baseUrl).forgotPassword(body);
		},
		{
			detail: {
				tags: ['Authentication'],
				summary: 'Request password reset',
				description: 'Sends a password reset email to the user',
				responses: {
					200: {
						description: 'Reset email sent successfully',
						content: {
							'application/json': {
								example: { message: 'Password reset email sent' }
							}
						}
					},
					404: { description: 'User not found' }
				}
			},
			body: t.Object({
				email: t.String({ minLength: 1, pattern: '^.*\\S.*$' }),
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
				tags: ['Authentication'],
				summary: 'Validate reset token',
				description: 'Validates a password reset token',
				responses: {
					200: {
						description: 'Token is valid',
						content: {
							'application/json': {
								example: { valid: true, email: 'user@example.com' }
							}
						}
					},
					401: { description: 'Invalid or expired token' }
				}
			},
			query: t.Object({
				token: t.String(),
			}),
		},
	)
	.post(
		"/reset-password",
		async ({ body, headers }) => {
			const token = headers.authorization?.replace("Bearer ", "");
			if (!token) {
				throw new AuthenticationError("No token provided");
			}
			return new UserPasswordReset(userRepository, hash, emailSender, logger, jwt).resetPassword({
				token,
				newPassword: body.password,
			});
		},
		{
			detail: {
				tags: ['Authentication'],
				summary: 'Reset password',
				description: 'Resets user password using a valid reset token',
				security: [{ bearerAuth: [] }],
				responses: {
					200: {
						description: 'Password reset successfully',
						content: {
							'application/json': {
								example: { message: 'Password reset successfully' }
							}
						}
					},
					401: { description: 'Invalid or expired token' }
				}
			},
			body: t.Object({
				password: t.String({ minLength: 4, maxLength: 4, pattern: '^.*\\S.*$' }),
			}),
		},
	)
	.get(
		"/:userId/stats",
		async ({ query, params }) => {
			const banListName = query.banListName;
			const season = query.season;
			const userId = params.userId;
			return new UserStatsFinder(userStatsRepository).find({ banListName, userId, season });
		},
		{
			detail: {
				tags: ['User Management'],
				summary: 'Get user statistics',
				description: 'Retrieves user statistics for a specific ban list and season',
				responses: {
					200: {
						description: 'Statistics retrieved successfully',
						content: {
							'application/json': {
								example: {
									userId: 'user-123',
									banListName: 'Global',
									season: 1,
									wins: 15,
									losses: 5,
									winRate: 0.75
								}
							}
						}
					},
					404: { description: 'User not found' }
				}
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
				tags: ['User Management'],
				summary: 'Get user matches',
				description: 'Retrieves paginated match history for a user',
				responses: {
					200: {
						description: 'Matches retrieved successfully',
						content: {
							'application/json': {
								example: {
									data: [
										{
											id: 'match-1',
											date: '2025-11-24T10:00:00Z',
											opponent: 'Player2',
											result: 'win'
										}
									],
									total: 50,
									page: 1,
									limit: 100
								}
							}
						}
					}
				}
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
				"/change-password",
				async ({ body, bearer }) => {
					const decodedToken = jwt.decode(bearer as string) as { id: string };
					return new UserPasswordUpdater(userRepository, hash, logger, emailSender).updatePassword({
						...(body as { password: string; newPassword: string }),
						id: decodedToken.id,
					});
				},
				{
					detail: {
						tags: ['User Management'],
						summary: 'Change password',
						description: 'Changes the password for the authenticated user',
						security: [{ bearerAuth: [] }],
						responses: {
							200: {
								description: 'Password changed successfully',
								content: {
									'application/json': {
										example: { message: 'Password updated successfully' }
									}
								}
							},
							401: { description: 'Invalid current password' }
						}
					},
					body: t.Object({
						password: t.String({ minLength: 1, pattern: '^.*\\S.*$' }),
						newPassword: t.String({ minLength: 4, maxLength: 4, pattern: '^.*\\S.*$' }),
					}),
				},
			)
			.post(
				"/change-username",
				async ({ body, bearer }) => {
					const { id } = jwt.decode(bearer as string) as { id: string };
					return new UserUsernameUpdater(userRepository).updateUsername({ ...(body as { username: string }), id });
				},
				{
					detail: {
						tags: ['User Management'],
						summary: 'Change username',
						description: 'Changes the username for the authenticated user',
						security: [{ bearerAuth: [] }],
						responses: {
							200: {
								description: 'Username changed successfully',
								content: {
									'application/json': {
										example: { message: 'Username updated successfully' }
									}
								}
							},
							409: { description: 'Username already taken' }
						}
					},
					body: t.Object({
						username: t.String({ minLength: 1, maxLength: 14, pattern: '^.*\\S.*$' }),
					}),
				},
			)
	)

	// Admin Endpoints (NOT protected by banGuard)
	.post(
		"/:userId/ban",
		async ({ params, body, bearer }) => {
			const { id: adminId, role } = jwt.decode(bearer as string) as { id: string; role: string };
			if (role !== UserProfileRole.ADMIN) {
				throw new UnauthorizedError("You do not have permission to ban users");
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
				tags: ['User Bans'],
				summary: 'Ban user',
				description: 'Bans a user with a reason and optional expiration date. Requires admin privileges.',
				security: [{ bearerAuth: [] }],
				responses: {
					200: {
						description: 'User banned successfully',
						content: {
							'application/json': {
								example: { success: true }
							}
						}
					},
					401: { description: 'Unauthorized - Admin role required' },
					404: { description: 'User not found' }
				}
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
				throw new UnauthorizedError("You do not have permissions to unban users");
			}
			await new UserUnbanUser(userBanRepository).execute(params.userId);
			return { success: true };
		},
		{
			detail: {
				tags: ['User Bans'],
				summary: 'Unban user',
				description: 'Removes an active ban from a user. Requires admin privileges.',
				security: [{ bearerAuth: [] }],
				responses: {
					200: {
						description: 'User unbanned successfully',
						content: {
							'application/json': {
								example: { success: true }
							}
						}
					},
					401: { description: 'Unauthorized - Admin role required' },
					404: { description: 'User or ban not found' }
				}
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
				throw new UnauthorizedError("You do not have permission to view bans");
			}
			const ban = await new UserGetActiveBan(userBanRepository).execute(params.userId);
			return { activeBan: ban };
		},
		{
			params: t.Object({ userId: t.String() }),
		},
	)
	.get(
		"/:userId/ban/history",
		async ({ params, bearer }) => {
			const { role } = jwt.decode(bearer as string) as { id: string; role: string };
			if (role !== UserProfileRole.ADMIN) {
				throw new UnauthorizedError("You do not have permission to view ban history");
			}
			const bans = await new UserGetBanHistory(userBanRepository).execute(params.userId);
			return { history: bans };
		},
		{
			detail: {
				tags: ['User Bans'],
				summary: 'Get ban history',
				description: 'Retrieves the complete ban history for a user. Requires admin privileges.',
				security: [{ bearerAuth: [] }],
				responses: {
					200: {
						description: 'Ban history retrieved successfully',
						content: {
							'application/json': {
								example: {
									history: [
										{
											id: 'ban-123',
											reason: 'Inappropriate behavior',
											bannedAt: '2025-11-24T10:00:00Z',
											unbannedAt: '2025-11-25T10:00:00Z',
											isActive: false
										}
									]
								}
							}
						}
					},
					401: { description: 'Unauthorized - Admin role required' },
					404: { description: 'User not found' }
				}
			},
			params: t.Object({ userId: t.String() }),
		},
	);
