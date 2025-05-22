import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { JWT } from "../../../shared/JWT";
import { Logger } from "../../../shared/logger/domain/Logger";
import { UserRepository } from "../domain/UserRepository";

export class UserForgotPassword {
	constructor(
		private readonly repository: UserRepository,
		private readonly emailSender: EmailSender,
		private readonly jwt: JWT,
		private readonly logger: Logger,
		private readonly baseUrl: string,
	) {}

	async forgotPassword({ email }: { email: string }): Promise<{ message: string }> {
		this.logger.info(`Forgot password for email ${email}`);

		const user = await this.repository.findByEmail(email);

		if (!user) {
			throw new NotFoundError(`User with email ${email} not found`);
		}

		const token = this.jwt.generate({ id: user.id }, { expiresIn: "1h" });

		const emailData = {
			username: user.username,
			token,
			subject: "Password Recovery - Evolution YGO",
			html: `
				<p>Hello ${user.username}!</p>
				<p>You have requested to reset your password. Use the following link to reset your password:</p>
				<p><strong>${this.baseUrl}/reset-password?token=${token}</strong></p>
				<p>This link will expire in 1 hour.</p>
				<p>If you didn't request this, please ignore this email.</p>
				<p>Regards,</p>
				<p>Evolution YGO Team</p>
			`,
			text: `
				Hello ${user.username}!
				You have requested to reset your password. Use the following link to reset your password:
				${this.baseUrl}/reset-password?token=${token}
				This link will expire in 1 hour.
			`,
		};

		this.emailSender.send(user.email, emailData).catch((error: Error) => {
			this.logger.error(`Error sending email to ${email}`);
			this.logger.error(error);
			throw new Error("Error sending email");
		});

		return {
			message: "Email sent successfully",
		};
	}
}
