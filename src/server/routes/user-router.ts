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

const logger = new Pino();
const emailSender = new ResendEmailSender();
const userRepository = new UserPostgresRepository();
const userStatsRepository = new UserStatsPostgresRepository();
const matchRepository = new MatchPostgresRepository();
const hash = new Hash();
const jwt = new JWT(config.jwt);

export const userRouter = new Elysia({ prefix: "/users" })
	.post(
		"/register",
		async ({ body }) => {
			const id = randomUUID();

			return new UserRegister(userRepository, hash, logger, emailSender).register({ ...body, id });
		},
		{
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
			body: t.Object({
				password: t.String({ minLength: 4, maxLength: 4, pattern: '^.*\\S.*$' }),
			}),
		},
	)
	.use(bearer())
	.post(
		"/change-password",
		async ({ body, bearer }) => {
			const decodedToken = jwt.decode(bearer as string) as { id: string };

			return new UserPasswordUpdater(userRepository, hash, logger, emailSender).updatePassword({
				...body,
				id: decodedToken.id,
			});
		},
		{
			body: t.Object({
				password: t.String({ minLength: 1, pattern: '^.*\\S.*$' }),
				newPassword: t.String({ minLength: 4, maxLength: 4, pattern: '^.*\\S.*$' }),
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
	.use(bearer())
	.post(
		"/change-username",
		async ({ body, bearer }) => {
			const { id } = jwt.decode(bearer as string) as { id: string };

			return new UserUsernameUpdater(userRepository).updateUsername({ ...body, id });
		},
		{
			body: t.Object({
				username: t.String({ minLength: 1, maxLength: 14, pattern: '^.*\\S.*$' }),
			}),
		},
	);
