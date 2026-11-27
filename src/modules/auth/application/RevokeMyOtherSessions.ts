import { RevokeSessions } from "./RevokeSessions";

export type RevokeMyOtherSessionsInput = {
	userId: string;
	/** The calling sign-in, which stays; null for a JWT issued before sessions carried it. */
	currentSid: string | null;
	now: Date;
};

/** Signs every other device of the caller out. Idempotent. */
export class RevokeMyOtherSessions {
	constructor(
		private readonly sessions: Pick<RevokeSessions, "revokeAllForUser" | "revokeAllForUserExcept">,
	) {}

	async run({ userId, currentSid, now }: RevokeMyOtherSessionsInput): Promise<void> {
		// Without a sid the calling device cannot be told apart, so every sign-in ends; that
		// device keeps working until its JWT expires and then signs in again.
		if (currentSid === null) {
			await this.sessions.revokeAllForUser(userId, now);
			return;
		}
		await this.sessions.revokeAllForUserExcept(userId, currentSid, now);
	}
}
