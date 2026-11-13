export interface DiscordReturnFrontend {
	origin: string;
	/** Page of that frontend that finishes the sign-in; `{query}` receives the result. */
	template: string;
}

export type DiscordReturnOutcome =
	/** Signed in: `code` is traded for the session. */
	| { code: string; redirect: string }
	/** New to us: `register` is the ticket for the form that creates the account. */
	| { register: string; username: string; redirect: string }
	| { error: DiscordLoginError };

/** Why a Discord sign-in did not produce a session; sent to the frontend as `error`. */
export const DISCORD_LOGIN_ERRORS = [
	"access_denied",
	"invalid_state",
	"discord_unavailable",
	// The Discord account has no verified email, which accounts are matched and created by.
	"email_unverified",
	// The email belongs to an account that cannot take this Discord account.
	"account_conflict",
] as const;
export type DiscordLoginError = (typeof DISCORD_LOGIN_ERRORS)[number];

/**
 * Builds the frontend URL the browser lands on after Discord.
 *
 * The origin a request names only selects an entry of the registry; the URL
 * itself always comes from the registry, so the callback can never be turned
 * into an open redirect.
 */
export class DiscordReturnLinkBuilder {
	private readonly entries: DiscordReturnFrontend[];

	constructor(entries: DiscordReturnFrontend[]) {
		if (entries.length === 0) {
			throw new Error("DiscordReturnLinkBuilder needs at least one frontend");
		}
		this.entries = entries.map((entry) => ({
			origin: normalizeOrigin(entry.origin),
			template: entry.template,
		}));
	}

	/** The registered origin matching `origin`, or the first one when it matches none. */
	resolveOrigin(origin: string | null | undefined): string {
		const wanted = origin ? normalizeOrigin(origin) : null;
		const entry = this.entries.find((candidate) => candidate.origin === wanted);
		return (entry ?? this.entries[0]).origin;
	}

	build(origin: string | null | undefined, outcome: DiscordReturnOutcome): string {
		const resolved = this.resolveOrigin(origin);
		const entry =
			this.entries.find((candidate) => candidate.origin === resolved) ?? this.entries[0];
		const query = new URLSearchParams(outcome).toString();
		return entry.template.replaceAll("{query}", query);
	}
}

/**
 * Path inside the frontend to open after signing in. Anything that is not a
 * plain absolute path falls back to the home page.
 */
export function sanitizeReturnPath(value: string | null | undefined): string {
	if (!value || value.length > 512) return "/";
	if (!value.startsWith("/") || value.startsWith("//")) return "/";
	if (value.includes("\\")) return "/";
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code <= 31 || code === 127) return "/";
	}
	return value;
}

function normalizeOrigin(value: string): string {
	return value.trim().toLowerCase().replace(/\/+$/, "");
}
