import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { Logger } from "../../../shared/logger/domain/Logger";
import { User } from "../domain/User";
import { UserRepository } from "../domain/UserRepository";

export class UserRegister {
	constructor(
		private readonly repository: UserRepository,
		private readonly logger: Logger,
		private readonly emailSender: EmailSender,
	) {}

	async register({ id, email, username }: { id: string; email: string; username: string }): Promise<unknown> {
		this.logger.info(`Creating new user ${email}`);

		const existingUser = await this.repository.findByEmailOrUsername(email, username);

		if (existingUser) {
			throw new Error(`User with email ${email} and username ${username} already exists`);
		}

		const password = this.passwordGenerator(4);

		const user = User.create({ id, email, username, password });

		await this.repository.create(user);

		this.emailSender.send(user.email, { username, password }).catch((error: Error) => {
			this.logger.error(`Error sending email to ${email}`);
			this.logger.error(error);
		});

		return user.toJson();
	}

	private readonly passwordGenerator = (length: number) => {
		const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		let password = "";
		for (let i = 0; i < length; i++) {
			const randomIndex = Math.floor(Math.random() * charset.length);
			password += charset.charAt(randomIndex);
		}

		return password;
	};
}
