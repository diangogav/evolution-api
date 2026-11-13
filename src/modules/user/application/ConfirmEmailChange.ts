import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { renderBrandedEmail } from "../../../shared/email/EmailTemplate";
import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { ConflictError } from "../../../shared/errors/ConflictError";
import { Logger } from "../../../shared/logger/domain/Logger";
import { EmailChanges, EmailTakenError } from "../domain/EmailChanges";
import { UserRepository } from "../domain/UserRepository";
import { EmailChangeLinks } from "./EmailChangeLinks";

/** Applies a change of email address for whoever opens the link mailed to the new one. */
export class ConfirmEmailChange {
	constructor(
		private readonly links: Pick<EmailChangeLinks, "read">,
		private readonly users: Pick<UserRepository, "findById">,
		private readonly emailChanges: EmailChanges,
		private readonly emailSender: EmailSender,
		private readonly logger: Logger,
	) {}

	async run({ token, now }: { token: string; now: Date }): Promise<{ email: string }> {
		const claim = this.links.read(token);
		const user = claim ? await this.users.findById(claim.userId) : null;
		// A link requested for an address the account has since left is stale: another
		// change, or this same one, already went through.
		if (!claim || !user || user.email !== claim.currentEmail) {
			throw new AuthenticationError("Invalid or expired link");
		}

		// Checked again because the address may have been taken since the request.
		if (await this.emailChanges.isEmailInUse(claim.newEmail)) {
			throw new ConflictError("That email address is already in use");
		}

		let changed: boolean;
		try {
			changed = await this.emailChanges.changeEmail({
				userId: user.id,
				currentEmail: claim.currentEmail,
				newEmail: claim.newEmail,
				verifiedAt: now,
			});
		} catch (error) {
			if (error instanceof EmailTakenError) throw new ConflictError(error.message);
			throw error;
		}
		if (!changed) throw new AuthenticationError("Invalid or expired link");

		this.logger.info(`Email changed for user: ${user.id}`);
		this.notifyPreviousAddress(user.username, claim.currentEmail, claim.newEmail);
		return { email: claim.newEmail };
	}

	// The alarm for the real owner if someone else made the change. Not awaited: the
	// change is done, and a failing mail provider must not report it as failed.
	private notifyPreviousAddress(username: string, previousEmail: string, newEmail: string): void {
		const { html, text } = renderBrandedEmail({
			heading: `Your Evolution email was changed, ${username}`,
			paragraphs: [
				`Your Evolution account now uses ${newEmail} instead of this address. Password recovery emails will go there from now on.`,
				"If you did not make this change, contact us on the Evolution Discord server right away.",
			],
		});

		this.emailSender
			.send(previousEmail, {
				username,
				subject: "Your Evolution email was changed",
				html,
				text,
			})
			.catch((error: Error) => {
				this.logger.error("Error sending the email change notice to the previous address");
				this.logger.error(error);
			});
	}
}
