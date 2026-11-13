import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { renderBrandedEmail } from "../../../shared/email/EmailTemplate";
import { ConflictError } from "../../../shared/errors/ConflictError";
import { Hash } from "../../../shared/Hash";
import { JWT } from "../../../shared/JWT";
import { Logger } from "../../../shared/logger/domain/Logger";
import { GamePassword } from "../domain/GamePassword";
import { EmailVerificationLinks } from "./EmailVerificationLinks";
import { SecurePassword } from "../domain/SecurePassword";
import { User } from "../domain/User";
import { UserRepository, VerifiedDiscordIdentity } from "../domain/UserRepository";

export type RegisteredUser = {
	id: string;
	username: string;
	email: string;
	token: string;
	gamePassword: string;
};

export class UserRegister {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
		private readonly logger: Logger,
		private readonly emailSender: EmailSender,
		private readonly jwt: JWT,
		private readonly verificationLinks?: Pick<EmailVerificationLinks, "build">,
	) {}

	async register({
		id,
		email,
		username,
		password,
		discord,
		origin,
		referer,
	}: {
		id: string;
		email: string;
		username: string;
		password: string;
		/** Set when the account is created through Discord, which already verified the email. */
		discord?: VerifiedDiscordIdentity;
		/** Where the request came from; picks the frontend the verification link opens. */
		origin?: string | null;
		referer?: string | null;
	}): Promise<RegisteredUser> {
		this.logger.info(`Creating new user ${email}`);

		const existingUser = await this.repository.findByEmailOrUsername(email, username);

		if (existingUser) {
			throw new ConflictError(`User with email ${email} or username ${username} already exists`);
		}

		// Every account always gets a 4-char game password so it can connect through other ygopro clients.
		const gamePassword = GamePassword.generate();
		const gamePasswordHashed = await this.hash.hash(gamePassword.value);

		return this.registerWithSecurePassword({
			id,
			email,
			username,
			password,
			gamePassword: gamePassword.value,
			gamePasswordHashed,
			discord,
			origin,
			referer,
		});
	}

	private async registerWithSecurePassword({
		id,
		email,
		username,
		password,
		gamePassword,
		gamePasswordHashed,
		discord,
		origin,
		referer,
	}: {
		id: string;
		email: string;
		username: string;
		password: string;
		gamePassword: string;
		gamePasswordHashed: string;
		discord?: VerifiedDiscordIdentity;
		origin?: string | null;
		referer?: string | null;
	}): Promise<RegisteredUser> {
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

		await this.repository.create(user, discord);

		// An address Discord vouched for needs no confirmation. Any other gets the link in
		// this welcome email instead of a second message.
		const verifyUrl =
			!discord && this.verificationLinks
				? this.verificationLinks.build({ userId: id, email, origin, referer })
				: null;

		const { html, text } = renderBrandedEmail({
			heading: `Welcome to Evolution, ${username}!`,
			paragraphs: [
				"Your account is ready. Log in to the website anytime with your email and the password you just created.",
				...(verifyUrl
					? [
							"Confirm that this address is yours with the button below, so we can help you recover your account if you ever lose access. The link works for 24 hours.",
						]
					: []),
				"To play from external clients like EDOpro, generate your dueling PIN from your profile settings and use it to connect to the server. You can regenerate it whenever you need a new one.",
				"See you in the arena!",
			],
			cta: verifyUrl
				? { label: "Confirm my email", url: verifyUrl }
				: { label: "Open Evolution", url: "https://evolutionygo.com" },
		});

		const emailData = {
			username,
			subject: "Welcome to Evolution",
			html,
			text,
		};

		this.emailSender.send(user.email, emailData).catch((error: Error) => {
			this.logger.error(`Error sending email to ${email}`);
			this.logger.error(error);
		});

		const token = this.jwt.generate({ id: user.id, role: user.role });

		return { id: user.id, username: user.username, email: user.email, token, gamePassword };
	}
}
