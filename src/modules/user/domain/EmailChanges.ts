/** Moves a user to another email address. */
export interface EmailChanges {
	/** True when some user, deleted ones included, has this address in any letter case. */
	isEmailInUse(email: string): Promise<boolean>;

	/**
	 * Replaces the user's address and records the new one as verified at `verifiedAt`.
	 * Answers false, changing nothing, when the user no longer has `currentEmail`.
	 */
	changeEmail(input: {
		userId: string;
		currentEmail: string;
		newEmail: string;
		verifiedAt: Date;
	}): Promise<boolean>;
}

/** Thrown by `changeEmail` when another user took the address first. */
export class EmailTakenError extends Error {
	constructor() {
		super("That email address is already in use");
		this.name = "EmailTakenError";
	}
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims the address and checks it has the shape of one; null when it does not. */
export function normalizeNewEmail(value: string): string | null {
	const email = value.trim();
	return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}
