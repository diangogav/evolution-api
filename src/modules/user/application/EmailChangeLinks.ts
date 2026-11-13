import { JWT } from "../../../shared/JWT";
import { ResetPasswordLinkBuilder } from "../domain/ResetPasswordLinkBuilder";

const PURPOSE = "email-change";

/** A day to open the email at the new address. */
const EMAIL_CHANGE_LINK_TTL = "24h";

export type EmailChangeClaim = {
	userId: string;
	/** Address the account had when the change was requested. */
	currentEmail: string;
	/** Address the link was mailed to and the account moves to. */
	newEmail: string;
};

/**
 * Builds and reads the links that confirm a change of email address.
 *
 * The link goes to the new address, so opening it proves the user reads that
 * inbox. The token names the user as `changeUserId`, never as `id`: routes
 * that take a session read `id`, and a link in an inbox must not work as one.
 */
export class EmailChangeLinks {
	constructor(
		private readonly jwt: JWT,
		/** Picks the frontend page by request origin; the same registry rules as reset links. */
		private readonly frontends: Pick<ResetPasswordLinkBuilder, "build">,
	) {}

	build(input: EmailChangeClaim & { origin?: string | null; referer?: string | null }): string {
		const token = this.jwt.generate(
			{
				purpose: PURPOSE,
				changeUserId: input.userId,
				currentEmail: input.currentEmail,
				newEmail: input.newEmail,
			},
			{ expiresIn: EMAIL_CHANGE_LINK_TTL },
		);

		return this.frontends.build({ origin: input.origin, referer: input.referer, token });
	}

	/** What a token we issued asks for, or null when it is not ours or has expired. */
	read(token: string | null | undefined): EmailChangeClaim | null {
		if (!token) return null;
		let decoded: unknown;
		try {
			decoded = this.jwt.decode(token);
		} catch {
			return null;
		}
		if (typeof decoded !== "object" || decoded === null) return null;
		const { purpose, changeUserId, currentEmail, newEmail } = decoded as Record<string, unknown>;
		if (purpose !== PURPOSE) return null;
		if (typeof changeUserId !== "string") return null;
		if (typeof currentEmail !== "string" || typeof newEmail !== "string") return null;
		return { userId: changeUserId, currentEmail, newEmail };
	}
}
