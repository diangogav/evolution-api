import { createHash } from "crypto";

import { JWT } from "../../../shared/JWT";

const PURPOSE = "discord-login";

/** Ten minutes covers a slow consent screen without keeping a state alive for long. */
export const DISCORD_STATE_TTL_SECONDS = 600;

export type DiscordLoginStatePayload = {
	/** Frontend the sign-in started from. */
	origin: string;
	/** Path inside that frontend to open afterwards. */
	redirect: string;
	/** Hash of the nonce kept in the browser cookie. */
	nonceHash: string;
	/** Set when a signed-in user is linking Discord to their account instead of signing in. */
	linkUserId?: string;
};

/**
 * The OAuth `state` value: a signed, short-lived token.
 *
 * Signing alone proves we issued it, not that this browser asked for it. An
 * attacker can start a sign-in with their own Discord account and hand the
 * resulting callback URL to a victim, who would end up inside the attacker's
 * account. The state therefore carries the hash of a nonce that only the
 * browser that started the flow holds in a cookie.
 */
export class DiscordLoginState {
	constructor(private readonly jwt: JWT) {}

	sign(input: { origin: string; redirect: string; nonce: string; linkUserId?: string }): string {
		return this.jwt.generate(
			{
				purpose: PURPOSE,
				origin: input.origin,
				redirect: input.redirect,
				nonceHash: hashNonce(input.nonce),
				...(input.linkUserId ? { linkUserId: input.linkUserId } : {}),
			},
			{ expiresIn: DISCORD_STATE_TTL_SECONDS },
		);
	}

	/** The payload of a state we issued and that has not expired, or null. */
	read(state: string | null | undefined): DiscordLoginStatePayload | null {
		if (!state) return null;
		let decoded: unknown;
		try {
			decoded = this.jwt.decode(state);
		} catch {
			return null;
		}
		if (typeof decoded !== "object" || decoded === null) return null;
		const { purpose, origin, redirect, nonceHash, linkUserId } = decoded as Record<string, unknown>;
		if (purpose !== PURPOSE) return null;
		if (typeof origin !== "string" || typeof redirect !== "string") return null;
		if (typeof nonceHash !== "string") return null;
		return typeof linkUserId === "string"
			? { origin, redirect, nonceHash, linkUserId }
			: { origin, redirect, nonceHash };
	}

	/** True when `nonce` is the one the state was signed for. */
	matchesNonce(payload: DiscordLoginStatePayload, nonce: string | null | undefined): boolean {
		return Boolean(nonce) && hashNonce(nonce as string) === payload.nonceHash;
	}
}

function hashNonce(nonce: string): string {
	return createHash("sha256").update(nonce).digest("hex");
}
