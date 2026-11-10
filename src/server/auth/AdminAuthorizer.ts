import { UserProfileRole } from "../../evolution-types/src/types/UserProfileRole";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { ForbiddenError } from "../../shared/errors/ForbiddenError";
import type { JWT } from "../../shared/JWT";
import { apiJwt } from "./apiJwt";

export interface AdminPrincipal {
	readonly userId: string;
}

export interface AdminAuthorizer {
	requireAdmin(token: string | undefined): AdminPrincipal;
}

/** Asks whether a token carries the admin role, for routes open to players and admins alike. */
export interface AdminRoleChecker {
	isAdmin(token: string | undefined): boolean;
}

export class JwtAdminAuthorizer implements AdminAuthorizer, AdminRoleChecker {
	constructor(private readonly jwt: JWT) {}

	requireAdmin(token: string | undefined): AdminPrincipal {
		if (!token) throw new AuthenticationError("Bearer token is required");
		const decoded = this.jwt.decode(token) as { id?: string; role?: string };
		if (!decoded.id) throw new AuthenticationError("Token has no user id");
		if (decoded.role !== UserProfileRole.ADMIN) {
			throw new ForbiddenError("Administrator role is required");
		}
		return { userId: decoded.id };
	}

	isAdmin(token: string | undefined): boolean {
		try {
			this.requireAdmin(token);
			return true;
		} catch (error) {
			if (error instanceof AuthenticationError || error instanceof ForbiddenError) return false;
			throw error;
		}
	}
}

export const adminAuthorizer = new JwtAdminAuthorizer(apiJwt);
