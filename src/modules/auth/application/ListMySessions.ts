import { RefreshTokenRepository } from "../domain/RefreshToken";
import { describeDevice } from "../domain/describeDevice";

export type ListMySessionsInput = {
	userId: string;
	/** The sign-in of the calling request (the JWT's `sid`); null for a token without one. */
	currentSid: string | null;
	now: Date;
};

export type MySession = {
	/** The sign-in id, the same value the JWT carries as `sid`. */
	id: string;
	browser: string | null;
	os: string | null;
	signedInAt: Date;
	lastUsedAt: Date;
	current: boolean;
};

/** The caller's signed-in devices: the calling one first, then the most recently used. */
export class ListMySessions {
	constructor(private readonly tokens: Pick<RefreshTokenRepository, "listActiveForUser">) {}

	async run({ userId, currentSid, now }: ListMySessionsInput): Promise<MySession[]> {
		const sessions = await this.tokens.listActiveForUser(userId, now);

		return sessions
			.map((session) => ({
				id: session.familyId,
				...describeDevice(session.userAgent),
				signedInAt: session.signedInAt,
				lastUsedAt: session.lastUsedAt,
				current: session.familyId === currentSid,
			}))
			.sort(
				(a, b) =>
					Number(b.current) - Number(a.current) || b.lastUsedAt.getTime() - a.lastUsedAt.getTime(),
			);
	}
}
