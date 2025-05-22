import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { ConflictError } from "../../../shared/errors/ConflictError";
import { Hash } from "../../../shared/Hash";
import { Logger } from "../../../shared/logger/domain/Logger";
import { User } from "../domain/User";
import { UserRepository } from "../domain/UserRepository";

export class UserRegister {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
		private readonly logger: Logger,
		private readonly emailSender: EmailSender,
	) {}

	async register({ id, email, username }: { id: string; email: string; username: string }): Promise<unknown> {
		this.logger.info(`Creating new user ${email}`);

		const existingUser = await this.repository.findByEmailOrUsername(email, username);

		if (existingUser) {
			throw new ConflictError(`User with email ${email} or username ${username} already exists`);
		}

		const password = this.passwordGenerator(4);
		this.logger.debug(`Password generate for email ${email} is ${password}`);
		const passwordHashed = await this.hash.hash(password);

		const user = User.create({ id, email, username, password: passwordHashed });

		await this.repository.create(user);

		const emailData = {
			username,
			password,
			subject: "Welcome to Evolution YGO",
			html: `<p>Welcome ${username}, your password is ${password}</p>`,
			text: `Welcome ${username}, your password is ${password}`,
		};

		this.emailSender.send(user.email, emailData).catch((error: Error) => {
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
