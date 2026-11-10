import { describe, expect, it } from "bun:test";

import { UserProfileRole } from "../../../../src/evolution-types/src/types/UserProfileRole";
import { JwtAdminAuthorizer } from "../../../../src/server/auth/AdminAuthorizer";
import { AuthenticationError } from "../../../../src/shared/errors/AuthenticationError";
import { ForbiddenError } from "../../../../src/shared/errors/ForbiddenError";
import { JWT } from "../../../../src/shared/JWT";

const jwt = new JWT({ issuer: "test", secret: "test-secret" });
const authorizer = new JwtAdminAuthorizer(jwt);
const admin = jwt.generate({ id: "admin-1", role: UserProfileRole.ADMIN });
const player = jwt.generate({ id: "user-1", role: UserProfileRole.USER });

describe("JwtAdminAuthorizer", () => {
	it("returns the admin's user id and refuses players and missing tokens", () => {
		expect(authorizer.requireAdmin(admin)).toEqual({ userId: "admin-1" });
		expect(() => authorizer.requireAdmin(player)).toThrow(ForbiddenError);
		expect(() => authorizer.requireAdmin(undefined)).toThrow(AuthenticationError);
	});

	it("answers isAdmin without throwing for players, bad and missing tokens", () => {
		expect(authorizer.isAdmin(admin)).toBe(true);
		expect(authorizer.isAdmin(player)).toBe(false);
		expect(authorizer.isAdmin("not-a-jwt")).toBe(false);
		expect(authorizer.isAdmin(undefined)).toBe(false);
		expect(authorizer.isAdmin(jwt.generate({ role: UserProfileRole.ADMIN }))).toBe(false);
	});
});
