import { EmailSender } from "../../../shared/email/domain/EmailSender";
import { renderBrandedEmail } from "../../../shared/email/EmailTemplate";
import { Logger } from "../../../shared/logger/domain/Logger";
import { DiscordAccounts, EmailAccount } from "../domain/DiscordAccounts";
import { DiscordIdentity } from "../domain/DiscordIdentity";
import { DiscordRegistrationStore, suggestUsername } from "../domain/DiscordRegistration";
import { DiscordLoginError } from "../domain/DiscordReturnLinkBuilder";

export type DiscordAdmission =
	/** The identity belongs to this user, linked before or just now. */
	| { kind: "login"; userId: string }
	/** Nobody has this identity or its email: the owner may create an account. */
	| { kind: "register"; ticket: string; username: string }
	| { kind: "error"; error: DiscordLoginError };

/**
 * Decides what a Discord identity may do here: sign in, be linked to the
 * account that has its email, or register.
 *
 * Linking by email is safe only because Discord verified the address: whoever
 * signs in owns it. Our own registration never verified emails, so the account
 * may have been created by someone else using this address. The owner is told
 * by email that the account already had a password they may not have chosen.
 */
export class AdmitDiscordIdentity {
	constructor(
		private readonly accounts: DiscordAccounts,
		private readonly registrations: Pick<DiscordRegistrationStore, "save">,
		private readonly emailSender: EmailSender,
		private readonly logger: Logger,
	) {}

	async run(identity: DiscordIdentity, now: Date): Promise<DiscordAdmission> {
		const linked = await this.accounts.findByDiscordId(identity.id);
		if (linked) return { kind: "login", userId: linked.id };

		if (!identity.email || !identity.emailVerified) {
			return { kind: "error", error: "email_unverified" };
		}

		const matches = await this.accounts.findByEmail(identity.email);
		if (matches.length === 0) {
			const ticket = await this.registrations.save({
				discordId: identity.id,
				email: identity.email,
			});
			return { kind: "register", ticket, username: suggestUsername(identity) };
		}

		// Two accounts with the same address in different case, a deleted account, or one
		// that already has another Discord account: none of them has an obvious owner.
		const [account] = matches;
		if (matches.length > 1 || account.deleted || account.discordId) {
			return { kind: "error", error: "account_conflict" };
		}

		if (!(await this.accounts.link(account.id, identity.id, now))) {
			// Lost a race with another sign-in that linked the account first.
			const raced = await this.accounts.findByDiscordId(identity.id);
			return raced
				? { kind: "login", userId: raced.id }
				: { kind: "error", error: "account_conflict" };
		}

		this.notifyLinked(account, identity);
		return { kind: "login", userId: account.id };
	}

	// Not awaited: a slow or failing mail provider must not hold up the sign-in.
	private notifyLinked(account: EmailAccount, identity: DiscordIdentity): void {
		const { html, text } = renderBrandedEmail({
			heading: `Discord linked to your account, ${account.username}`,
			paragraphs: [
				`The Discord account "${identity.username}" is now linked to your Evolution account. You can sign in with Discord from now on.`,
				"Your account already had a password, and it still works. If you did not set that password yourself, reset it now with “Forgot password” on the sign-in page.",
				"If you did not link this Discord account, contact us on the Evolution Discord server.",
			],
			cta: { label: "Open Evolution", url: "https://evoduel.com" },
		});

		this.emailSender
			.send(account.email, {
				username: account.username,
				subject: "Discord linked to your Evolution account",
				html,
				text,
			})
			.catch((error: Error) => {
				this.logger.error(`Error sending the Discord link notice to user ${account.id}`);
				this.logger.error(error);
			});
	}
}
