import { t } from "elysia";

/** Response of POST /users/login. */
export const LoginSchema = t.Object({
	id: t.String(),
	token: t.String({ description: "JWT for the Authorization: Bearer header" }),
	username: t.String(),
	mustUpgrade: t.Boolean({
		description:
			"True when the user signed in with the game password and must set an account password",
	}),
	refreshToken: t.String({
		description:
			"Single-use token for POST /auth/refresh, which renews the session without the password; clients that do not renew can ignore it",
	}),
});

/** Body of POST /auth/refresh and POST /auth/logout. */
export const RefreshTokenBodySchema = t.Object({
	refreshToken: t.String({ minLength: 1, maxLength: 256 }),
});

/** Body of POST /auth/discord/session. */
export const LoginCodeExchangeSchema = t.Object({
	code: t.String({
		minLength: 1,
		maxLength: 128,
		description: "Single-use code received in the redirect back from Discord",
	}),
});

/** Body of POST /auth/discord/register. */
export const DiscordRegistrationSchema = t.Object({
	ticket: t.String({
		minLength: 1,
		maxLength: 128,
		description: "Registration ticket received in the redirect back from Discord",
	}),
	username: t.String({ minLength: 1, maxLength: 14, pattern: "^.*\\S.*$" }),
	password: t.String({ minLength: 1, pattern: "^.*\\S.*$" }),
});

/** Response of GET /auth/discord/link. */
export const DiscordLinkStatusSchema = t.Object({
	linked: t.Boolean({ description: "True when a Discord account is linked to the user" }),
	canUnlink: t.Boolean({
		description:
			"False when the user has no account password and would be left without a way to sign in",
	}),
});

/** Body of POST /auth/discord/link. */
export const DiscordLinkStartBodySchema = t.Object({
	origin: t.Optional(t.String({ maxLength: 200 })),
	redirect: t.Optional(t.String({ maxLength: 512 })),
});

/** Response of POST /auth/discord/link. */
export const DiscordLinkStartSchema = t.Object({
	url: t.String({ description: "URL the browser must navigate to; valid for five minutes" }),
});
