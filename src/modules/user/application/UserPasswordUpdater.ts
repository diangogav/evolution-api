import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Hash } from "../../../shared/Hash";
import { Logger } from "../../../shared/logger/domain/Logger";
import { UserRepository } from "../domain/UserRepository";

export class UserPasswordUpdater {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
		private readonly logger: Logger,
		private readonly emailSender: EmailSender,
	) {}

	async updatePassword({
		id,
		password,
		newPassword,
	}: {
		id: string;
		password: string;
		newPassword: string;
	}): Promise<void> {
		const user = await this.repository.findById(id);

		if (!user) {
			this.logger.error(`User not found for password update: ${id}`);
			throw new NotFoundError(`user with id ${id} not found`);
		}

		const isCorrectPassword = await this.hash.compare(password, user.password);

		if (!isCorrectPassword) {
			this.logger.error(`Wrong password for user: ${id}`);
			throw new AuthenticationError("Wrong password");
		}

		if (!newPassword.trim()) {
			throw new InvalidArgumentError(`password cannot be empty or only spaces`);
		}
		if (newPassword.length !== 4) {
			throw new InvalidArgumentError(`password must have a length of 4`);
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
	}
}
