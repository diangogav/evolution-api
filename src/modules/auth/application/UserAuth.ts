import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { Hash } from "../../../shared/Hash";
import { JWT } from "../../../shared/JWT";
import { UserRepository } from "../../user/domain/UserRepository";

export class UserAuth {
	constructor(
		private readonly userRepository: UserRepository,
		private readonly hash: Hash,
		private readonly jwt: JWT,
	) {}

	async login({
		email,
		password,
	}: {
		email: string;
		password: string;
	}): Promise<{ token: string; username: string; id: string; mustUpgrade: boolean }> {
		const user = await this.userRepository.findByEmail(email);
		if (!user) {
			throw new AuthenticationError("Wrong email or password");
		}

		// Primary credential: the account password (strong, set through the new client).
		if (user.securePassword && (await this.hash.compare(password, user.securePassword))) {
			const token = this.jwt.generate({ id: user.id, role: user.role });

			return { id: user.id, token, username: user.username, mustUpgrade: false };
		}

		// Fallback: the 4-char game password, only while the user has not set an account password yet.
		// Once migrated, the weak game password no longer grants API access.
		if (!user.securePassword && (await this.hash.compare(password, user.password))) {
			const token = this.jwt.generate({ id: user.id, role: user.role, mustUpgrade: true });

			return { id: user.id, token, username: user.username, mustUpgrade: true };
		}

		throw new AuthenticationError("Wrong email or password");
	}
}
