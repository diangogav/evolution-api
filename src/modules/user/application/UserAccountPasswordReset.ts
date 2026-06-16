import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { renderBrandedEmail } from "../../../shared/email/EmailTemplate";
import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Hash } from "../../../shared/Hash";
import { JWT } from "../../../shared/JWT";
import { Logger } from "../../../shared/logger/domain/Logger";
import { SecurePassword } from "../domain/SecurePassword";
import { UserRepository } from "../domain/UserRepository";

export class UserAccountPasswordReset {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
		private readonly emailSender: EmailSender,
		private readonly logger: Logger,
		private readonly jwt: JWT,
	) {}

	async resetPassword({
		token,
		newPassword,
	}: {
		token: string;
		newPassword: string;
	}): Promise<{ id: string; username: string; token: string; migrated: boolean }> {
		if (!token) {
			throw new AuthenticationError("No token provided");
		}

		const decoded = this.jwt.decode(token) as { id: string };
		const user = await this.repository.findById(decoded.id);
		if (!user) {
			this.logger.error(`User not found for account password reset: ${decoded.id}`);
			throw new NotFoundError("User not found");
		}

		// null = the user never had an account password, so this reset is their first migration.
		const migrated = user.securePassword === null;

		const securePassword = SecurePassword.create(newPassword);
		const securePasswordHashed = await this.hash.hash(securePassword.value);

		const updatedUser = user.updateSecurePassword(securePasswordHashed);
		await this.repository.update(updatedUser);
		this.logger.info(`Account password reset for user: ${user.id}`);

		const { html, text } = renderBrandedEmail({
			heading: "Your password was reset",
			paragraphs: [
				"Your Evolution account password has been reset successfully. You can now log in with your new password.",
				"If this wasn't you, contact support right away.",
			],
			cta: { label: "Go to Evolution", url: "https://evolutionygo.com" },
		});

		const emailData = {
			username: user.username,
			subject: "Your Evolution password was reset",
			html,
			text,
		};

		await this.emailSender.send(user.email, emailData);

		const sessionToken = this.jwt.generate({ id: updatedUser.id, role: updatedUser.role });

		return { id: updatedUser.id, token: sessionToken, username: updatedUser.username, migrated };
	}
}
