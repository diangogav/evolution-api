import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Hash } from "../../../shared/Hash";
import { JWT } from "../../../shared/JWT";
import { SecurePassword } from "../domain/SecurePassword";
import { SessionRevoker } from "../domain/SessionRevoker";
import { UserRepository } from "../domain/UserRepository";

export class UserUpgradePassword {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
		private readonly jwt: JWT,
		private readonly sessions?: SessionRevoker,
	) {}

	async upgrade({
		userId,
		password,
		now = new Date(),
	}: {
		userId: string;
		password: string;
		now?: Date;
	}): Promise<{ id: string; token: string; username: string }> {
		const user = await this.repository.findById(userId);
		if (!user) {
			throw new NotFoundError(`User with id ${userId} not found`);
		}

		if (user.securePassword) {
			throw new ConflictError("User already has an account password");
		}

		const securePassword = SecurePassword.create(password);
		const securePasswordHashed = await this.hash.hash(securePassword.value);

		const upgradedUser = user.updateSecurePassword(securePasswordHashed);
		await this.repository.update(upgradedUser);
		// Sign-ins made with the game password still say "must upgrade"; they end here.
		await this.sessions?.revokeAllForUser(upgradedUser.id, now);

		const token = this.jwt.generate({ id: upgradedUser.id, role: upgradedUser.role });

		return { id: upgradedUser.id, token, username: upgradedUser.username };
	}
}
