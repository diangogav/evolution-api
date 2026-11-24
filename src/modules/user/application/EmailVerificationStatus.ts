import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { renderBrandedEmail } from "../../../shared/email/EmailTemplate";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { TooManyRequestsError } from "../../../shared/errors/TooManyRequestsError";
import {
	CONFIRM_EMAIL_PARAGRAPH,
	EmailVerifications,
	VerificationResendThrottle,
} from "../domain/EmailVerifications";
import { UserRepository } from "../domain/UserRepository";
import { isVerifiedAccount } from "../domain/VerifiedAccount";
import { EmailVerificationLinks } from "./EmailVerificationLinks";

export type ResendVerificationInput = {
	userId: string;
	origin?: string | null;
	referer?: string | null;
};

/** What a signed-in user can do about their own email verification: read it and ask for the email again. */
export class EmailVerificationStatus {
	constructor(
		private readonly users: Pick<UserRepository, "findById">,
		private readonly emailVerifications: Pick<
			EmailVerifications,
			"isVerified" | "verificationFacts"
		>,
		private readonly links: Pick<EmailVerificationLinks, "build">,
		private readonly emailSender: EmailSender,
		private readonly throttle: VerificationResendThrottle,
		private readonly cutoff: Date | null,
	) {}

	/**
	 * `verified` is about the email address alone. `accountVerified` is what the gates
	 * on chat, ranked and tournaments check, which a linked Discord or an account older
	 * than the cutoff also satisfies.
	 */
	async get(userId: string): Promise<{ verified: boolean; accountVerified: boolean }> {
		const facts = await this.emailVerifications.verificationFacts(userId);
		if (!facts) return { verified: false, accountVerified: false };

		return {
			verified: facts.emailVerifiedAt !== null,
			accountVerified: isVerifiedAccount(facts, this.cutoff),
		};
	}

	/** Sends the verification email again; `sent` is false when there is nothing left to verify. */
	async resend(input: ResendVerificationInput): Promise<{ sent: boolean }> {
		const user = await this.users.findById(input.userId);
		if (!user) throw new NotFoundError("User not found");
		if (await this.emailVerifications.isVerified(user.id)) return { sent: false };

		if (!(await this.throttle.allow(user.id))) {
			throw new TooManyRequestsError("A verification email was sent a moment ago, wait a minute");
		}

		const link = this.links.build({
			userId: user.id,
			email: user.email,
			origin: input.origin,
			referer: input.referer,
		});
		const { html, text } = renderBrandedEmail({
			heading: `Confirm your email, ${user.username}`,
			paragraphs: [
				CONFIRM_EMAIL_PARAGRAPH,
				"If you did not create an Evolution account, you can ignore this email.",
			],
			cta: { label: "Confirm my email", url: link },
		});

		await this.emailSender.send(user.email, {
			username: user.username,
			subject: "Confirm your Evolution email",
			html,
			text,
		});
		return { sent: true };
	}
}
