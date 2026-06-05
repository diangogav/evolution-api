import { describe, expect, it } from "bun:test";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";

import { User } from "../../../../../src/modules/user/domain/User";

describe("User", () => {
	it("creates a user carrying a secure password", () => {
		const user = User.create({
			id: "a-user-id",
			username: "player",
			email: "player@evolution.com",
			password: "hashed-game-password",
			securePassword: "hashed-secure-password",
			role: UserProfileRole.USER,
		});

		expect(user.securePassword).toBe("hashed-secure-password");
	});

	it("defaults secure password to null when not provided", () => {
		const user = User.create({
			id: "a-user-id",
			username: "player",
			email: "player@evolution.com",
			password: "hashed-game-password",
			role: UserProfileRole.USER,
		});

		expect(user.securePassword).toBeNull();
	});

	it("preserves the secure password when the game password is updated", () => {
		const user = User.create({
			id: "a-user-id",
			username: "player",
			email: "player@evolution.com",
			password: "hashed-game-password",
			securePassword: "hashed-secure-password",
			role: UserProfileRole.USER,
		});

		const updated = user.updatePassword("new-hashed-game-password");

		expect(updated.securePassword).toBe("hashed-secure-password");
	});

	it("sets the secure password when upgrading and preserves the rest", () => {
		const user = User.create({
			id: "a-user-id",
			username: "player",
			email: "player@evolution.com",
			password: "hashed-game-password",
			role: UserProfileRole.USER,
		});

		const upgraded = user.updateSecurePassword("hashed-account-password");

		expect(upgraded.securePassword).toBe("hashed-account-password");
		expect(upgraded.password).toBe(user.password);
		expect(upgraded.username).toBe(user.username);
	});
});
