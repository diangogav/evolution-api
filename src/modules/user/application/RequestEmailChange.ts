import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { renderBrandedEmail } from "../../../shared/email/EmailTemplate";
import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { ConflictError } from "../../../shared/errors/ConflictError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { TooManyRequestsError } from "../../../shared/errors/TooManyRequestsError";
import { Hash } from "../../../shared/Hash";
import { EmailChanges, normalizeNewEmail } from "../domain/EmailChanges";
import { VerificationResendThrottle } from "../domain/EmailVerifications";
import { UserRepository } from "../domain/UserRepository";
import { EmailChangeLinks } from "./EmailChangeLinks";

export type RequestEmailChangeInput = {
	userId: string;
	newEmail: string;
	currentPassword: string;
	origin?: string | null;
	referer?: string | null;
};

/**
 * Starts a change of email address. Nothing changes yet: the account keeps its
 * address until the link mailed to the new one is opened.
 *
 * The current password is required because the email is what recovers the
 * account. A session alone must not be enough to move it elsewhere.
 */
export class RequestEmailChange {
	constructor(
		private readonly users: Pick<UserRepository, "findById">,
		private readonly emailChanges: Pick<EmailChanges, "isEmailInUse">,
		private readonly hash: Pick<Hash, "compare">,
		private readonly links: Pick<EmailChangeLinks, "build">,
		private readonly emailSender: EmailSender,
		private readonly throttle: VerificationResendThrottle,
	) {}

	async run(input: RequestEmailChangeInput): Promise<{ sent: true }> {
		const user = await this.users.findById(input.userId);
		if (!user) throw new NotFoundError("User not found");

		if (
			!user.securePassword ||
			!(await this.hash.compare(input.currentPassword, user.securePassword))
		) {
			throw new AuthenticationError("Wrong password");
		}

		const newEmail = normalizeNewEmail(input.newEmail);
		if (!newEmail) throw new InvalidArgumentError("the email address is not valid");
		if (newEmail.toLowerCase() === user.email.toLowerCase()) {
			throw new InvalidArgumentError("the new email address is the one the account already has");
		}
		if (await this.emailChanges.isEmailInUse(newEmail)) {
			throw new ConflictError("That email address is already in use");
		}

		if (!(await this.throttle.allow(user.id))) {
			throw new TooManyRequestsError("An email was sent a moment ago, wait a minute");
		}

		const link = this.links.build({
			userId: user.id,
			currentEmail: user.email,
			newEmail,
			origin: input.origin,
			referer: input.referer,
		});
		const { html, text } = renderBrandedEmail({
			heading: `Confirm your new email, ${user.username}`,
			paragraphs: [
				"You asked to use this address for your Evolution account. Confirm it with the button below; your account keeps its current address until you do. The link works for 24 hours.",
				"If you did not ask for this, you can ignore this email.",
			],
			cta: { label: "Use this email", url: link },
		});

		await this.emailSender.send(newEmail, {
			username: user.username,
			subject: "Confirm your new Evolution email",
			html,
			text,
		});
		return { sent: true };
	}
}
