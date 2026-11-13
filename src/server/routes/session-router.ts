import { Elysia } from "elysia";

import { EndSession } from "../../modules/auth/application/EndSession";
import { RefreshSession } from "../../modules/auth/application/RefreshSession";
import { LoginSchema, RefreshTokenBodySchema } from "../../modules/auth/infrastructure/AuthSchemas";
import { UserGetActiveBan } from "../../modules/user/application/UserGetActiveBan";
import { UserBanPostgresRepository } from "../../modules/user/infrastructure/UserBanPostgresRepository";
import { UserPostgresRepository } from "../../modules/user/infrastructure/UserPostgresRepository";
import { Pino } from "../../shared/logger/infrastructure/Pino";
import { apiJwt } from "../auth/apiJwt";
import { refreshTokenRepository, sessionTokens } from "../composition/sessionTokens";
import { emptyOk, errorResponses, jsonOk } from "../openapi/responses";

export interface SessionRouterDependencies {
	refresh: Pick<RefreshSession, "run">;
	end: Pick<EndSession, "run">;
}

export function createSessionRouter({ refresh, end }: SessionRouterDependencies) {
	return new Elysia({ prefix: "/auth" })
		.post("/refresh", async ({ body }) => refresh.run({ ...body, now: new Date() }), {
			body: RefreshTokenBodySchema,
			detail: {
				tags: ["Authentication"],
				summary: "Renew a session",
				description:
					"Trades a refresh token for a new JWT and a new refresh token. A refresh token works once and lasts 30 days from its issue. Presenting one that was already used revokes the whole sign-in, since it means the token exists in two places. Answers 401 for an unknown, expired, used or revoked token and 403 for a banned user.",
				responses: {
					200: jsonOk(LoginSchema, "The renewed session", {
						id: "user-123",
						token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
						username: "player1",
						mustUpgrade: false,
						refreshToken: "nB3x0vY8mTq2cLh5JrW7dKpZ1sFu4aEg6iOoXyVbN9M",
					}),
					...errorResponses(401, 403, 422),
				},
			},
		})
		.post(
			"/logout",
			async ({ body, set }) => {
				await end.run({ ...body, now: new Date() });
				set.status = 204;
			},
			{
				body: RefreshTokenBodySchema,
				detail: {
					tags: ["Authentication"],
					summary: "Sign out",
					description:
						"Revokes the sign-in the refresh token belongs to, so it can no longer be renewed. Idempotent: an unknown token also answers 204. The JWT already issued stays valid until it expires.",
					responses: {
						204: emptyOk("The sign-in can no longer be renewed"),
						...errorResponses(422),
					},
				},
			},
		);
}

export const sessionRouter = createSessionRouter({
	refresh: new RefreshSession(
		refreshTokenRepository,
		sessionTokens,
		new UserPostgresRepository(),
		new UserGetActiveBan(new UserBanPostgresRepository()),
		apiJwt,
		new Pino(),
	),
	end: new EndSession(refreshTokenRepository),
});
