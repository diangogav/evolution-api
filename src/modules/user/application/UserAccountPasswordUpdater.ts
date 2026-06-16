import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { renderBrandedEmail } from "../../../shared/email/EmailTemplate";
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

		const { html, text } = renderBrandedEmail({
			heading: "Your password was changed",
			paragraphs: [
				"Your Evolution account password was just changed. For security, you'll need to log in again with your new password.",
				"If this wasn't you, contact support right away.",
			],
			cta: { label: "Go to Evolution", url: "https://evolutionygo.com" },
		});

		const emailData = {
			username: user.username,
			subject: "Your Evolution password was changed",
			html,
			text,
		};

		await this.emailSender.send(user.email, emailData);
	}
}
