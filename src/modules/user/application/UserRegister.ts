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

	async register({ id, email, username, password }: { id: string; email: string; username: string; password: string }): Promise<unknown> {
		this.logger.info(`Creating new user ${email}`);

		const existingUser = await this.repository.findByEmailOrUsername(email, username);

		if (existingUser) {
			throw new ConflictError(`User with email ${email} or username ${username} already exists`);
		}

		// Every account always gets a 4-char game password so it can connect through other ygopro clients.
		const gamePassword = GamePassword.generate();
		const gamePasswordHashed = await this.hash.hash(gamePassword.value);

		return this.registerWithSecurePassword({ id, email, username, password, gamePasswordHashed });
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
			html: `<p>Welcome to Evolution YGO, ${username}!</p><p>Your account is ready. Log in to the website anytime with your email and the password you just created.</p><p>To play from external clients like EDOpro, generate your dueling PIN from your profile settings and use it to connect to the server. You can regenerate it whenever you need a new one.</p><p>See you in the arena!</p><p>— Evolution YGO Team</p>`,
			text: `Welcome to Evolution YGO, ${username}! Your account is ready. Log in to the website anytime with your email and the password you just created. To play from external clients like EDOpro, generate your dueling PIN from your profile settings and use it to connect to the server. You can regenerate it whenever you need a new one. See you in the arena! — Evolution YGO Team`,
		};

		this.emailSender.send(user.email, emailData).catch((error: Error) => {
			this.logger.error(`Error sending email to ${email}`);
			this.logger.error(error);
		});

		const token = this.jwt.generate({ id: user.id, role: user.role });

		return { id: user.id, username: user.username, email: user.email, token };
	}
}
