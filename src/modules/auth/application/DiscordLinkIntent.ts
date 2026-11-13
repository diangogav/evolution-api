import { JWT } from "../../../shared/JWT";

const PURPOSE = "discord-link";

/** Enough to click a button and follow a redirect; the intent is useless after that. */
const LINK_INTENT_TTL_SECONDS = 300;

/**
 * Carries "this signed-in user wants to link Discord" into the OAuth flow.
 *
 * The flow starts with a page navigation, which cannot send the session token
 * in a header. The settings screen asks for an intent with its session, and the
 * navigation carries the intent instead.
 *
 * The user is named by `linkUserId`, never by `id`: routes that take a session
 * read `id`, and an intent must not work as one.
 */
export class DiscordLinkIntent {
	constructor(private readonly jwt: JWT) {}

	sign(userId: string): string {
		return this.jwt.generate(
			{ purpose: PURPOSE, linkUserId: userId },
			{ expiresIn: LINK_INTENT_TTL_SECONDS },
		);
	}

	/** The user an intent we issued names, or null when it is not ours or has expired. */
	read(intent: string | null | undefined): string | null {
		if (!intent) return null;
		let decoded: unknown;
		try {
			decoded = this.jwt.decode(intent);
		} catch {
			return null;
		}
		if (typeof decoded !== "object" || decoded === null) return null;
		const { purpose, linkUserId } = decoded as Record<string, unknown>;
		return purpose === PURPOSE && typeof linkUserId === "string" ? linkUserId : null;
	}
}
