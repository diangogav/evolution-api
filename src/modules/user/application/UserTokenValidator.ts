import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { JWT } from "../../../shared/JWT";
import { Logger } from "../../../shared/logger/domain/Logger";
import { UserRepository } from "../domain/UserRepository";

export class UserTokenValidator {
	constructor(
		private readonly repository: UserRepository,
		private readonly jwt: JWT,
		private readonly logger: Logger,
	) {}

	async validateToken({ token }: { token: string }): Promise<{ valid: boolean; userId: string }> {
		try {
			const decoded = this.jwt.decode(token) as { id: string };
			const user = await this.repository.findById(decoded.id);
			this.logger.info(`User found: ${user}`);

			if (!user) {
				this.logger.error(`User not found: ${decoded.id}`);
				throw new NotFoundError("User not found");
			}

			return {
				valid: true,
				userId: user.id,
			};
		} catch (error) {
			throw new AuthenticationError("Invalid or expired token");
		}
	}
}
