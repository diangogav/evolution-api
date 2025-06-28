import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Hash } from "../../../shared/Hash";
import { JWT } from "../../../shared/JWT";
import { Logger } from "../../../shared/logger/domain/Logger";
import { UserRepository } from "../domain/UserRepository";

export class UserPasswordReset {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
		private readonly emailSender: EmailSender,
		private readonly logger: Logger,
		private readonly jwt: JWT,
	) { }

	async resetPassword({ token, newPassword }: { token: string; newPassword: string }): Promise<void> {
		if (!token) {
			throw new AuthenticationError("No token provided");
		}

		if (!newPassword.trim()) {
			throw new InvalidArgumentError("password cannot be empty or only spaces");
		}

		if (newPassword.length !== 4) {
			throw new InvalidArgumentError("Password must be exactly 4 characters long");
		}

		try {
			const decoded = this.jwt.decode(token) as { id: string };
			const user = await this.repository.findById(decoded.id);
			this.logger.info(`User found: ${user}`);

			if (!user) {
				this.logger.error(`User not found for password reset: ${decoded.id}`);
				throw new NotFoundError("User not found");
			}

			const passwordHashed = await this.hash.hash(newPassword);
			const userUpdated = user.updatePassword(passwordHashed);
			await this.repository.update(userUpdated);

			this.logger.info(`Password updated for user: ${user.id}`);

			// Send confirmation email
			const emailData = {
				username: user.username,
				subject: "Password Changed - Evolution YGO",
				html: `
					<p>Hello ${user.username}!</p>
					<p>Your password has been successfully changed.</p>
					<p>If you didn't make this change, please contact support immediately.</p>
					<p>Regards,</p>
					<p>Evolution YGO Team</p>
				`,
				text: `
					Hello ${user.username}!
					Your password has been successfully changed.
					If you didn't make this change, please contact support immediately.
					Regards,
					Evolution YGO Team
				`,
			};

			await this.emailSender.send(user.email, emailData);
			this.logger.info(`Password change confirmation email sent to: ${user.email}`);
		} catch (error) {
			this.logger.error(`Error resetting password: ${error}`);
			throw error;
		}
	}
}
