import { Logger } from "../../../shared/logger/domain/Logger";
import { RevokedSessions } from "../domain/RevokedSessions";

/** How long a request waits for the revocation list before it goes on without it. */
export const REVOCATION_LOOKUP_TIMEOUT_MS = 250;

/** At most one log line per window while the list is down, not one per request. */
const LOG_WINDOW_MS = 60_000;

/**
 * Keeps the revocation list from taking every authenticated route down with it.
 *
 * The list only adds speed: a revoked sign-in already cannot renew, so its JWT ends on its
 * own. When the list does not answer in time, a lookup lets the request through and a mark
 * is skipped; the operation that called it (a sign-out, a password change) has already
 * taken effect in the database and must not fail because of the list.
 */
export class FailOpenRevokedSessions implements RevokedSessions {
	private lastLogAt = Number.NEGATIVE_INFINITY;

	constructor(
		private readonly inner: RevokedSessions,
		private readonly logger: Pick<Logger, "error">,
		private readonly timeoutMs = REVOCATION_LOOKUP_TIMEOUT_MS,
		private readonly clock: () => number = Date.now,
	) {}

	async isRevoked(familyId: string): Promise<boolean> {
		try {
			return await this.withTimeout(this.inner.isRevoked(familyId));
		} catch (error) {
			this.report("lookup", error);
			return false;
		}
	}

	async markRevoked(familyIds: readonly string[]): Promise<void> {
		try {
			await this.withTimeout(this.inner.markRevoked(familyIds));
		} catch (error) {
			this.report("mark", error);
		}
	}

	private async withTimeout<T>(operation: Promise<T>): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`no answer within ${this.timeoutMs} ms`)),
				this.timeoutMs,
			);
		});
		try {
			return await Promise.race([operation, timeout]);
		} finally {
			clearTimeout(timer);
		}
	}

	private report(operation: "lookup" | "mark", error: unknown): void {
		const now = this.clock();
		if (now - this.lastLogAt < LOG_WINDOW_MS) return;
		this.lastLogAt = now;
		const reason = error instanceof Error ? error.message : String(error);
		this.logger.error(`Revoked-session ${operation} failed, continuing without it: ${reason}`);
	}
}
