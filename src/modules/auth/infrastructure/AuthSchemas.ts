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
