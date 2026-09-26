import { t } from "elysia";

const isoDateTime = t.String({ format: "date-time" });

/**
 * Ban record read back from Postgres. `expiresAt` is `null` for a permanent
 * ban: the `expires_at` column is nullable and TypeORM reads a missing value
 * as `null`, not `undefined` as the domain `UserBan` type suggests.
 */
export const UserBanSchema = t.Object({
	id: t.String(),
	userId: t.String(),
	reason: t.String(),
	bannedAt: isoDateTime,
	expiresAt: t.Union([isoDateTime, t.Null()]),
	bannedBy: t.String(),
	createdAt: isoDateTime,
	updatedAt: isoDateTime,
});

/** Response of POST /users/{userId}/ban and POST /users/{userId}/unban. */
export const BanActionSchema = t.Object({ success: t.Literal(true) });

/** Response of GET /users/{userId}/ban/active: null when the user is not currently banned. */
export const ActiveBanSchema = t.Object({ activeBan: t.Union([UserBanSchema, t.Null()]) });

/** Response of GET /users/{userId}/ban/history, most recent ban first. */
export const BanHistorySchema = t.Object({ history: t.Array(UserBanSchema) });
