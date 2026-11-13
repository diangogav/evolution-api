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
