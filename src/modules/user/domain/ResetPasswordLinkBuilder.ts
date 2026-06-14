export interface FrontendResetEntry {
	/** Canonical origin (scheme + host[:port]) used to match the request. */
	origin: string;
	/** Reset page URL for that frontend. Must contain the `{token}` placeholder. */
	template: string;
}

/**
 * Builds the password-recovery link that goes into the email.
 *
 * Each frontend (e.g. evolutionygo.com, evoduel.com) is a different app with its
 * own routing, so the link is picked from a per-origin registry. The request
 * Origin/Referer is used ONLY to SELECT which frontend; the URL itself always
 * comes from the registry (config), never from the raw header — that is what
 * prevents password-reset poisoning (host/origin header injection).
 */
export class ResetPasswordLinkBuilder {
	private readonly entries: FrontendResetEntry[];

	constructor(
		entries: FrontendResetEntry[],
		private readonly defaultTemplate: string,
	) {
		this.entries = entries.map((entry) => ({ origin: this.normalize(entry.origin), template: entry.template }));
	}

	build({ origin, referer, token }: { origin?: string | null; referer?: string | null; token: string }): string {
		const requestOrigin = this.resolveOrigin(origin, referer);
		const entry = requestOrigin ? this.entries.find((candidate) => candidate.origin === requestOrigin) : undefined;
		const template = entry?.template ?? this.defaultTemplate;

		return template.replaceAll("{token}", token);
	}

	private resolveOrigin(origin?: string | null, referer?: string | null): string | null {
		if (origin && origin.trim()) {
			return this.normalize(origin);
		}

		if (referer && referer.trim()) {
			try {
				return this.normalize(new URL(referer).origin);
			} catch {
				return null;
			}
		}

		return null;
	}

	private normalize(value: string): string {
		return value.trim().toLowerCase().replace(/\/+$/, "");
	}
}
