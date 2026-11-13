import { t } from "elysia";

const token = t.String({ description: "JWT for the Authorization: Bearer header" });

const gamePassword = t.String({
	pattern: "^[A-Za-z0-9]{4}$",
	description: "4-character password for other ygopro clients, shown only once",
});

/** Response of POST /users/register. */
const refreshToken = t.String({
	description:
		"Single-use token for POST /auth/refresh, which renews the session without the password",
});

export const RegisteredUserSchema = t.Object({
	id: t.String(),
	username: t.String(),
	email: t.String(),
	token,
	gamePassword,
	refreshToken,
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
	refreshToken,
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

/** Body of POST /users/verify-email. */
export const EmailVerificationBodySchema = t.Object({
	token: t.String({
		minLength: 1,
		maxLength: 2048,
		description: "Token from the link in the verification email",
	}),
});

/** Response of POST /users/verify-email. */
export const EmailVerifiedSchema = t.Object({ verified: t.Literal(true) });

/** Response of GET /users/email-verification. */
export const EmailVerificationStatusSchema = t.Object({
	verified: t.Boolean({ description: "True when the caller's email address is confirmed" }),
});

/** Response of POST /users/email-verification/resend. */
export const EmailVerificationResendSchema = t.Object({
	sent: t.Boolean({ description: "False when the address was already confirmed" }),
});

/** Body of POST /users/change-email. */
export const EmailChangeRequestBodySchema = t.Object({
	newEmail: t.String({ minLength: 1, maxLength: 254 }),
	currentPassword: t.String({ minLength: 1 }),
});

/** Response of POST /users/change-email. */
export const EmailChangeRequestedSchema = t.Object({
	sent: t.Literal(true, { description: "A confirmation link was mailed to the new address" }),
});

/** Body of POST /users/confirm-email-change. */
export const EmailChangeConfirmBodySchema = t.Object({
	token: t.String({
		minLength: 1,
		maxLength: 2048,
		description: "Token from the link mailed to the new address",
	}),
});

/** Response of POST /users/confirm-email-change. */
export const EmailChangedSchema = t.Object({
	email: t.String({ description: "Address the account uses from now on" }),
});
