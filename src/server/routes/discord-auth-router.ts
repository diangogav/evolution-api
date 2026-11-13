import { randomUUID } from "crypto";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { CompleteDiscordLogin } from "../../modules/auth/application/CompleteDiscordLogin";
import {
	DISCORD_STATE_TTL_SECONDS,
	DiscordLoginState,
} from "../../modules/auth/application/DiscordLoginState";
import { ExchangeLoginCode } from "../../modules/auth/application/ExchangeLoginCode";
import { StartDiscordLogin } from "../../modules/auth/application/StartDiscordLogin";
import { DiscordReturnLinkBuilder } from "../../modules/auth/domain/DiscordReturnLinkBuilder";
import {
	LoginCodeExchangeSchema,
	LoginSchema,
} from "../../modules/auth/infrastructure/AuthSchemas";
import { BunRedisLoginCodeStore } from "../../modules/auth/infrastructure/BunRedisLoginCodeStore";
import { DiscordAccountsPostgresRepository } from "../../modules/auth/infrastructure/DiscordAccountsPostgresRepository";
import { HttpDiscordOAuthClient } from "../../modules/auth/infrastructure/HttpDiscordOAuthClient";
import { UserPostgresRepository } from "../../modules/user/infrastructure/UserPostgresRepository";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { Pino } from "../../shared/logger/infrastructure/Pino";
import { redisClient } from "../../shared/redis/redisClient";
import { apiJwt } from "../auth/apiJwt";
import { errorResponses, jsonOk } from "../openapi/responses";

// Ties the callback to the browser that started the sign-in; see DiscordLoginState.
const NONCE_COOKIE = "discord_login_nonce";
const COOKIE_PATH = "/api/v1/auth/discord";

const REDIRECT_RESPONSE = { description: "Redirect; the Location header carries the next URL" };

export interface DiscordAuthUseCases {
	start: Pick<StartDiscordLogin, "run">;
	complete: Pick<CompleteDiscordLogin, "run">;
	exchange: Pick<ExchangeLoginCode, "run">;
}

export interface DiscordAuthRouterDependencies {
	/** Null while Discord sign-in is not configured; every route then answers 404. */
	useCases: DiscordAuthUseCases | null;
	/** Marks the nonce cookie Secure; off only for plain-http local development. */
	secureCookie: boolean;
}

function buildUseCases(): DiscordAuthUseCases | null {
	if (!config.discordAuth) return null;

	const oauthClient = new HttpDiscordOAuthClient(config.discordAuth);
	const state = new DiscordLoginState(apiJwt);
	const links = new DiscordReturnLinkBuilder(config.discordLogin.frontends);
	const loginCodes = new BunRedisLoginCodeStore(redisClient);

	return {
		start: new StartDiscordLogin(oauthClient, state, links, randomUUID),
		complete: new CompleteDiscordLogin(
			oauthClient,
			new DiscordAccountsPostgresRepository(),
			loginCodes,
			state,
			links,
			new Pino(),
		),
		exchange: new ExchangeLoginCode(loginCodes, new UserPostgresRepository(), apiJwt),
	};
}

export function createDiscordAuthRouter({ useCases, secureCookie }: DiscordAuthRouterDependencies) {
	const enabled = (): DiscordAuthUseCases => {
		if (!useCases) throw new NotFoundError("Signing in with Discord is not available");
		return useCases;
	};

	return new Elysia({ prefix: "/auth/discord" })
		.get(
			"/start",
			({ query, cookie, redirect }) => {
				const { authorizeUrl, nonce } = enabled().start.run(query);
				cookie[NONCE_COOKIE].set({
					value: nonce,
					httpOnly: true,
					secure: secureCookie,
					// Lax still sends the cookie on the top-level redirect back from Discord.
					sameSite: "lax",
					path: COOKIE_PATH,
					maxAge: DISCORD_STATE_TTL_SECONDS,
				});
				return redirect(authorizeUrl, 302);
			},
			{
				detail: {
					tags: ["Authentication"],
					summary: "Start signing in with Discord",
					description:
						"Opened by the browser as a page navigation, not by a fetch. Redirects to Discord's consent page and sets a cookie that ties the callback to this browser. Answers 404 while Discord sign-in is not configured.",
					responses: { 302: REDIRECT_RESPONSE, ...errorResponses(404, 422) },
				},
				query: t.Object({
					origin: t.Optional(
						t.String({
							maxLength: 200,
							description:
								"Origin of the frontend to return to; an unregistered origin falls back to the default frontend",
						}),
					),
					redirect: t.Optional(
						t.String({
							maxLength: 512,
							description: "Path inside that frontend to open once signed in",
						}),
					),
				}),
			},
		)
		.get(
			"/callback",
			async ({ query, cookie, redirect }) => {
				const { redirectUrl } = await enabled().complete.run({
					code: query.code,
					state: query.state,
					error: query.error,
					nonce: cookie[NONCE_COOKIE].value as string | undefined,
				});
				cookie[NONCE_COOKIE].set({ value: "", path: COOKIE_PATH, maxAge: 0 });
				return redirect(redirectUrl, 302);
			},
			{
				detail: {
					tags: ["Authentication"],
					summary: "Discord sign-in callback",
					description:
						"Discord sends the browser here. Always redirects to the frontend, with `code` and `redirect` on success or with `error` (access_denied, invalid_state, discord_unavailable, not_linked) otherwise. The code is single-use and is traded at POST /auth/discord/session.",
					responses: { 302: REDIRECT_RESPONSE, ...errorResponses(404, 422) },
				},
				query: t.Object({
					code: t.Optional(t.String({ maxLength: 512 })),
					state: t.Optional(t.String({ maxLength: 2048 })),
					error: t.Optional(t.String({ maxLength: 200 })),
					error_description: t.Optional(t.String({ maxLength: 1000 })),
				}),
			},
		)
		.post(
			"/session",
			async ({ body }) => {
				return enabled().exchange.run(body);
			},
			{
				detail: {
					tags: ["Authentication"],
					summary: "Trade a Discord login code for a session",
					description:
						"Exchanges the single-use code from the Discord callback for a JWT. A code works once and expires after a minute.",
					responses: {
						200: jsonOk(LoginSchema, "Signed in", {
							id: "user-123",
							token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
							username: "player1",
							mustUpgrade: false,
						}),
						...errorResponses(401, 404, 422),
					},
				},
				body: LoginCodeExchangeSchema,
			},
		);
}

export const discordAuthRouter = createDiscordAuthRouter({
	useCases: buildUseCases(),
	secureCookie: config.discordLogin.secureCookie,
});
