import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { ConflictError } from "../../../shared/errors/ConflictError";
import { Hash } from "../../../shared/Hash";
import { JWT } from "../../../shared/JWT";
import { Logger } from "../../../shared/logger/domain/Logger";
import { GamePassword } from "../domain/GamePassword";
import { SecurePassword } from "../domain/SecurePassword";
import { User } from "../domain/User";
import { UserRepository } from "../domain/UserRepository";

export class UserRegister {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
		private readonly logger: Logger,
		private readonly emailSender: EmailSender,
		private readonly jwt: JWT,
	) { }

	async register({ id, email, username, password }: { id: string; email: string; username: string; password?: string }): Promise<unknown> {
		this.logger.info(`Creating new user ${email}`);

		const existingUser = await this.repository.findByEmailOrUsername(email, username);

		if (existingUser) {
			throw new ConflictError(`User with email ${email} or username ${username} already exists`);
		}

		// Every account always gets a 4-char game password so it can connect through other ygopro clients.
		const gamePassword = GamePassword.generate();
		const gamePasswordHashed = await this.hash.hash(gamePassword.value);

		if (password) {
			return this.registerWithSecurePassword({ id, email, username, password, gamePasswordHashed });
		}

		return this.registerWithGamePassword({ id, email, username, gamePassword: gamePassword.value, gamePasswordHashed });
	}

	private async registerWithSecurePassword({
		id,
		email,
		username,
		password,
		gamePasswordHashed,
	}: {
		id: string;
		email: string;
		username: string;
		password: string;
		gamePasswordHashed: string;
	}): Promise<{ id: string; username: string; email: string; token: string }> {
		const securePassword = SecurePassword.create(password);
		const securePasswordHashed = await this.hash.hash(securePassword.value);

		const user = User.create({
			id,
			email,
			username,
			password: gamePasswordHashed,
			securePassword: securePasswordHashed,
			role: UserProfileRole.USER,
		});

		await this.repository.create(user);

		const emailData = {
			username,
			subject: "Welcome to Evolution YGO",
			html: `<p>Welcome ${username}!</p>`,
			text: `Welcome ${username}!`,
		};

		this.emailSender.send(user.email, emailData).catch((error: Error) => {
			this.logger.error(`Error sending email to ${email}`);
			this.logger.error(error);
		});

		const token = this.jwt.generate({ id: user.id, role: user.role });

		return { id: user.id, username: user.username, email: user.email, token };
	}

	private async registerWithGamePassword({
		id,
		email,
		username,
		gamePassword,
		gamePasswordHashed,
	}: {
		id: string;
		email: string;
		username: string;
		gamePassword: string;
		gamePasswordHashed: string;
	}): Promise<{ id: string; username: string; email: string }> {
		this.logger.debug(`Password generate for email ${email} is ${gamePassword}`);

		const user = User.create({ id, email, username, password: gamePasswordHashed, role: UserProfileRole.USER });

		await this.repository.create(user);

		const emailData = {
			username,
			password: gamePassword,
			subject: "Welcome to Evolution YGO",
			html: `<p>Welcome ${username}, your password is ${gamePassword}</p>`,
			text: `Welcome ${username}, your password is ${gamePassword}`,
		};

		this.emailSender.send(user.email, emailData).catch((error: Error) => {
			this.logger.error(`Error sending email to ${email}`);
			this.logger.error(error);
		});

		return user.toJson();
	}
}
