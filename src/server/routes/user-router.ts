import { randomUUID } from "crypto";
import { Elysia, t } from "elysia";

import { UserAuth } from "../../modules/auth/application/UserAuth";
import { UserRegister } from "../../modules/user/application/UserRegister";
import { UserPostgresRepository } from "../../modules/user/infrastructure/UserPostgresRepository";
import { SengridEmailSender } from "../../shared/email/infrastructure/SengridEmailSender";
import { Hash } from "../../shared/Hash";
import { JWT } from "../../shared/JWT";
import { Pino } from "../../shared/logger/infrastructure/Pino";

const logger = new Pino();
const emailSender = new SengridEmailSender();
const userRepository = new UserPostgresRepository();
const hash = new Hash();
const jwt = new JWT();

export const userRouter = new Elysia({ prefix: "/users" })
	.post(
		"/register",
		async ({ body }) => {
			const id = randomUUID();

			return new UserRegister(userRepository, hash, logger, emailSender).register({ ...body, id });
		},
		{
			body: t.Object({
				username: t.String(),
				email: t.String(),
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
				email: t.String(),
				password: t.String(),
			}),
		},
	);
