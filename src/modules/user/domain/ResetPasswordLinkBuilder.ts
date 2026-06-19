export interface FrontendResetEntry {
	origin: string;
	template: string;
}

// The request origin only SELECTS the frontend; the URL always comes from the
// registry, never from the raw header — this prevents reset-link poisoning.
export class ResetPasswordLinkBuilder {
	private readonly entries: FrontendResetEntry[];

	constructor(
		entries: FrontendResetEntry[],
		private readonly defaultTemplate: string,
	) {
		this.entries = entries.map((entry) => ({
			origin: this.normalize(entry.origin),
			template: entry.template,
		}));
	}

	build({
		origin,
		referer,
		token,
	}: {
		origin?: string | null;
		referer?: string | null;
		token: string;
	}): string {
		const requestOrigin = this.resolveOrigin(origin, referer);
		const entry = requestOrigin
			? this.entries.find((candidate) => candidate.origin === requestOrigin)
			: undefined;
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
		return value
			.trim()
			.toLowerCase()
			.replace(/\/+$/, "")
			.replace(/^(https?:\/\/)www\./, "$1");
	}
}
