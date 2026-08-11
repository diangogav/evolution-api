import { UserProfileRole } from "../../evolution-types/src/types/UserProfileRole";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { ForbiddenError } from "../../shared/errors/ForbiddenError";
import type { JWT } from "../../shared/JWT";

export interface AdminPrincipal {
	readonly userId: string;
}

export interface AdminAuthorizer {
	requireAdmin(token: string | undefined): AdminPrincipal;
}

export class JwtAdminAuthorizer implements AdminAuthorizer {
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
}
