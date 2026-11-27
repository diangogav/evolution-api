import { bearer } from "@elysiajs/bearer";
import { Elysia } from "elysia";

import { UserGetActiveBan } from "../../modules/user/application/UserGetActiveBan";
import { UserBanPostgresRepository } from "../../modules/user/infrastructure/UserBanPostgresRepository";
import type { RevokedSessions } from "../../modules/auth/domain/RevokedSessions";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { ForbiddenError } from "../../shared/errors/ForbiddenError";
import type { JWT } from "../../shared/JWT";
import { revokedSessions } from "../composition/sessionTokens";
import { apiJwt } from "./apiJwt";

export type RequireUserDependencies = {
	jwt: Pick<JWT, "decode">;
	activeBans: { execute(userId: string): Promise<unknown | null> };
	revokedSessions: Pick<RevokedSessions, "isRevoked">;
};

// Authenticates a player: verifies the bearer token once, rejects banned users, and
// hands the token's user id to the handler as `userId` and its sign-in id as `sid`. It runs after request
// validation and applies only to the routes of the instance that uses it, so mount it
// inside the router (or a `.guard({}, ...)` block) that needs it.
export function createRequireUser({ jwt, activeBans, revokedSessions }: RequireUserDependencies) {
	return new Elysia().use(bearer()).resolve({ as: "scoped" }, async ({ bearer: token }) => {
		if (!token) throw new AuthenticationError("No token provided");
		let claims: { id?: unknown; sid?: unknown };
		try {
			claims = jwt.decode(token) as { id?: unknown; sid?: unknown };
		} catch {
			throw new AuthenticationError("Invalid token");
		}
		const userId = typeof claims.id === "string" ? claims.id : undefined;
		if (!userId) throw new AuthenticationError("Token has no user id");
		if (await activeBans.execute(userId)) throw new ForbiddenError("User is banned");
		// The sign-in the token belongs to; tokens issued before sessions carried it have none.
		const sid = typeof claims.sid === "string" ? claims.sid : null;
		if (sid && (await revokedSessions.isRevoked(sid))) {
			throw new AuthenticationError("Session revoked");
		}
		return { userId, sid };
	});
}

export const requireUser = createRequireUser({
	jwt: apiJwt,
	activeBans: new UserGetActiveBan(new UserBanPostgresRepository()),
	revokedSessions,
});
