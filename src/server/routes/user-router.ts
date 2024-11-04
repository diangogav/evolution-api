import { randomUUID } from "crypto";
import { Elysia, t } from "elysia";

import { UserRegister } from "../../modules/user/application/UserRegister";
import { UserPostgresRepository } from "../../modules/user/infrastructure/UserPostgresRepository";
import { SengridEmailSender } from "../../shared/email/infrastructure/SengridEmailSender";
import { Pino } from "../../shared/logger/infrastructure/Pino";

const logger = new Pino();
const emailSender = new SengridEmailSender();
const userRepository = new UserPostgresRepository();

export const userRouter = new Elysia({ prefix: "/users" }).post(
	"/register",
	({ body }) => {
		const id = randomUUID();

		return new UserRegister(userRepository, logger, emailSender).register({ ...body, id });
	},
	{
		body: t.Object({
			username: t.String(),
			email: t.String(),
		}),
	},
);
