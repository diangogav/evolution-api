import { JWT } from "../../../shared/JWT";
import { ResetPasswordLinkBuilder } from "../domain/ResetPasswordLinkBuilder";

const PURPOSE = "email-verification";

/** A day to open the email; after that the user asks for a new one. */
const VERIFICATION_LINK_TTL = "24h";

export type EmailVerificationClaim = {
	userId: string;
	/** Address the link was sent to; the link stops working if the account changes it. */
	email: string;
};

/**
 * Builds and reads the links that verify an email address.
 *
 * The token names the user as `verifyUserId`, never as `id`: routes that take
 * a session read `id`, and a link sitting in an inbox must not work as one.
 */
export class EmailVerificationLinks {
	constructor(
		private readonly jwt: JWT,
		/** Picks the frontend page by request origin; the same registry rules as reset links. */
		private readonly frontends: Pick<ResetPasswordLinkBuilder, "build">,
	) {}

	build(
		input: EmailVerificationClaim & { origin?: string | null; referer?: string | null },
	): string {
		const token = this.jwt.generate(
			{ purpose: PURPOSE, verifyUserId: input.userId, email: input.email },
			{ expiresIn: VERIFICATION_LINK_TTL },
		);

		return this.frontends.build({ origin: input.origin, referer: input.referer, token });
	}

	/** What a token we issued proves, or null when it is not ours or has expired. */
	read(token: string | null | undefined): EmailVerificationClaim | null {
		if (!token) return null;
		let decoded: unknown;
		try {
			decoded = this.jwt.decode(token);
		} catch {
			return null;
		}
		if (typeof decoded !== "object" || decoded === null) return null;
		const { purpose, verifyUserId, email } = decoded as Record<string, unknown>;
		if (purpose !== PURPOSE) return null;
		if (typeof verifyUserId !== "string" || typeof email !== "string") return null;
		return { userId: verifyUserId, email };
	}
}
