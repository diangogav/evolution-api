import { t } from "elysia";

const token = t.String({ description: "JWT for the Authorization: Bearer header" });

const gamePassword = t.String({
	pattern: "^[A-Za-z0-9]{4}$",
	description: "4-character password for other ygopro clients, shown only once",
});

/** Response of POST /users/register. */
export const RegisteredUserSchema = t.Object({
	id: t.String(),
	username: t.String(),
	email: t.String(),
	token,
	gamePassword,
});

/** Response of POST /users/forgot-password: identical whether or not the email is registered. */
export const PasswordResetRequestSchema = t.Object({ message: t.String() });

/** Response of GET /users/validate-token. */
export const TokenValidationSchema = t.Object({
	valid: t.Literal(true),
	userId: t.String(),
});

/** Response of GET /users/username-availability. */
export const UsernameAvailabilitySchema = t.Object({ available: t.Boolean() });

/** Response of POST /users/upgrade-password: a fresh session without the mustUpgrade claim. */
export const PasswordUpgradeSchema = t.Object({
	id: t.String(),
	token,
	username: t.String(),
});

/** Response of POST /users/reset-account-password: a fresh session for auto-login. */
export const AccountPasswordResetSchema = t.Object({
	...PasswordUpgradeSchema.properties,
	migrated: t.Boolean({
		description: "True when this reset set the account password for the first time",
	}),
});

/** Response of POST /users/game-password. */
export const GamePasswordSchema = t.Object({ gamePassword });
