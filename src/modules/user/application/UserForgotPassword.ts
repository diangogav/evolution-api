import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { renderBrandedEmail } from "../../../shared/email/EmailTemplate";
import { JWT } from "../../../shared/JWT";
import { Logger } from "../../../shared/logger/domain/Logger";
import { ResetPasswordLinkBuilder } from "../domain/ResetPasswordLinkBuilder";
import { UserRepository } from "../domain/UserRepository";

export class UserForgotPassword {
	constructor(
		private readonly repository: UserRepository,
		private readonly emailSender: EmailSender,
		private readonly jwt: JWT,
		private readonly logger: Logger,
		private readonly resetLinkBuilder: ResetPasswordLinkBuilder,
	) {}

	async forgotPassword({
		email,
		origin,
		referer,
	}: {
		email: string;
		origin?: string | null;
		referer?: string | null;
	}): Promise<{ message: string }> {
		this.logger.info(`Forgot password for email ${email}`);

		const user = await this.repository.findByEmail(email);

		if (!user) {
			// Same response whether or not the email exists, to prevent account enumeration.
			this.logger.info("Forgot password requested for an unregistered email");

			return { message: "Email sent successfully" };
		}

		const token = this.jwt.generate({ id: user.id }, { expiresIn: "1h" });
		const resetLink = this.resetLinkBuilder.build({ origin, referer, token });

		const { html, text } = renderBrandedEmail({
			heading: "Reset your password",
			paragraphs: [
				"We received a request to reset your Evolution account password. Click the button below to choose a new one. This link expires in 1 hour.",
				"If you didn't request this, you can safely ignore this email.",
			],
			cta: { label: "Reset password", url: resetLink },
		});

		const emailData = {
			username: user.username,
			token,
			subject: "Reset your Evolution password",
			html,
			text,
		};

		try {
			await this.emailSender.send(user.email, emailData);
		} catch (error) {
			this.logger.error(`Error sending email to ${email}`);
			this.logger.error(error as Error);
			throw new Error("Error sending email");
		}

		return {
			message: "Email sent successfully",
		};
	}
}
