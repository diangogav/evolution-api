import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { EmailVerifications } from "../domain/EmailVerifications";
import { UserRepository } from "../domain/UserRepository";
import { EmailVerificationLinks } from "./EmailVerificationLinks";

/** Marks an email as verified for whoever opens the link that was mailed to it. */
export class VerifyEmail {
	constructor(
		private readonly links: Pick<EmailVerificationLinks, "read">,
		private readonly users: Pick<UserRepository, "findById">,
		private readonly emailVerifications: Pick<EmailVerifications, "markVerified">,
	) {}

	async run({ token, now }: { token: string; now: Date }): Promise<{ verified: true }> {
		const claim = this.links.read(token);
		const user = claim ? await this.users.findById(claim.userId) : null;
		// A link mailed to an address the account no longer uses proves nothing about the new one.
		if (!claim || !user || user.email !== claim.email) {
			throw new AuthenticationError("Invalid or expired verification link");
		}

		await this.emailVerifications.markVerified(user.id, now);
		return { verified: true };
	}
}
