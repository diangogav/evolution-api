import { bearer } from "@elysiajs/bearer";
import { Elysia } from "elysia";

import { UserGetActiveBan } from "../../modules/user/application/UserGetActiveBan";
import { UserBanPostgresRepository } from "../../modules/user/infrastructure/UserBanPostgresRepository";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { ForbiddenError } from "../../shared/errors/ForbiddenError";
import type { JWT } from "../../shared/JWT";
import { apiJwt } from "./apiJwt";

export type RequireUserDependencies = {
	jwt: Pick<JWT, "decode">;
	activeBans: { execute(userId: string): Promise<unknown | null> };
};

// Authenticates a player: verifies the bearer token once, rejects banned users, and
// hands the token's user id to the handler as `userId`. It runs after request
// validation and applies only to the routes of the instance that uses it, so mount it
// inside the router (or a `.guard({}, ...)` block) that needs it.
export function createRequireUser({ jwt, activeBans }: RequireUserDependencies) {
	return new Elysia().use(bearer()).resolve({ as: "scoped" }, async ({ bearer: token }) => {
		if (!token) throw new AuthenticationError("No token provided");
		let userId: string | undefined;
		try {
			userId = (jwt.decode(token) as { id?: string }).id;
		} catch {
			throw new AuthenticationError("Invalid token");
		}
		if (!userId) throw new AuthenticationError("Token has no user id");
		if (await activeBans.execute(userId)) throw new ForbiddenError("User is banned");
		return { userId };
	});
}

export const requireUser = createRequireUser({
	jwt: apiJwt,
	activeBans: new UserGetActiveBan(new UserBanPostgresRepository()),
});
