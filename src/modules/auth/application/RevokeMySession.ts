import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { RefreshTokenRepository } from "../domain/RefreshToken";
import { RevokeSessions } from "./RevokeSessions";

export type RevokeMySessionInput = {
	userId: string;
	/** The sign-in id, as `GET /me/sessions` lists it. */
	sessionId: string;
	now: Date;
};

/** Signs one of the caller's devices out, the calling device included. */
export class RevokeMySession {
	constructor(
		private readonly tokens: Pick<RefreshTokenRepository, "listActiveForUser">,
		private readonly sessions: Pick<RevokeSessions, "revokeFamily">,
	) {}

	async run({ userId, sessionId, now }: RevokeMySessionInput): Promise<void> {
		// Only the caller's live sign-ins qualify: another user's id answers the same as an
		// unknown one, so the answer never tells whether a sign-in exists.
		const active = await this.tokens.listActiveForUser(userId, now);
		if (!active.some((session) => session.familyId === sessionId)) {
			throw new NotFoundError("Session not found");
		}
		await this.sessions.revokeFamily(sessionId, now);
	}
}
