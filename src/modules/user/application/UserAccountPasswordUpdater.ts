import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Hash } from "../../../shared/Hash";
import { Logger } from "../../../shared/logger/domain/Logger";
import { SecurePassword } from "../domain/SecurePassword";
import { UserRepository } from "../domain/UserRepository";

export class UserAccountPasswordUpdater {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
		private readonly logger: Logger,
		private readonly emailSender: EmailSender,
	) {}

	async updatePassword({
		id,
		currentPassword,
		newPassword,
	}: {
		id: string;
		currentPassword: string;
		newPassword: string;
	}): Promise<void> {
		const user = await this.repository.findById(id);
		if (!user) {
			throw new NotFoundError(`user with id ${id} not found`);
		}

		if (!user.securePassword || !(await this.hash.compare(currentPassword, user.securePassword))) {
			this.logger.error(`Wrong account password for user: ${id}`);
			throw new AuthenticationError("Wrong password");
		}

		const securePassword = SecurePassword.create(newPassword);
		const securePasswordHashed = await this.hash.hash(securePassword.value);

		await this.repository.update(user.updateSecurePassword(securePasswordHashed));
		this.logger.info(`Account password updated for user: ${user.id}`);

		const emailData = {
			username: user.username,
			subject: "Password Changed - Evolution YGO",
			html: `<p>Hello ${user.username}! Your account password has been changed. If this wasn't you, contact support immediately.</p>`,
			text: `Hello ${user.username}! Your account password has been changed. If this wasn't you, contact support immediately.`,
		};

		await this.emailSender.send(user.email, emailData);
	}
}
