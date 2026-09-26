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
