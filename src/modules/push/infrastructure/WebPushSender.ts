import { generateRequestDetails } from "web-push";

import { Logger } from "../../../shared/logger/domain/Logger";
import { PushSender, PushSendOptions, PushSendOutcome } from "../domain/PushSender";
import { PushSubscription } from "../domain/PushSubscription";

export type VapidDetails = { subject: string; publicKey: string; privateKey: string };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 10_000;

// fetch computes the length of the body itself.
const SKIPPED_HEADERS = new Set(["content-length"]);

/**
 * Encrypts and VAPID-signs the message with `web-push`'s `generateRequestDetails` and posts
 * it with `fetch`. `sendNotification` is not used: it is bound to Node's `https` module.
 * Never throws: every error is an outcome.
 */
export class WebPushSender implements PushSender {
	constructor(
		private readonly vapid: VapidDetails,
		private readonly logger: Logger,
		private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
		private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
	) {}

	async send(
		subscription: Pick<PushSubscription, "endpoint" | "p256dh" | "auth">,
		payload: string,
		options: PushSendOptions,
	): Promise<PushSendOutcome> {
		try {
			const details = generateRequestDetails(
				{
					endpoint: subscription.endpoint,
					keys: { p256dh: subscription.p256dh, auth: subscription.auth },
				},
				payload,
				{
					vapidDetails: this.vapid,
					TTL: options.ttlSeconds,
					urgency: options.urgency,
					topic: options.topic,
					contentEncoding: "aes128gcm",
				},
			);
			const headers: Record<string, string> = {};
			for (const [name, value] of Object.entries(details.headers)) {
				if (!SKIPPED_HEADERS.has(name.toLowerCase())) headers[name] = String(value);
			}
			const response = await this.fetchFn(details.endpoint, {
				method: details.method,
				headers,
				body: details.body ? new Uint8Array(details.body) : null,
				signal: AbortSignal.timeout(this.timeoutMs),
			});
			return this.outcome(response, subscription.endpoint);
		} catch (error) {
			this.logger.error(
				`Push to ${hostOf(subscription.endpoint)} failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return "failed";
		}
	}

	private outcome(response: Response, endpoint: string): PushSendOutcome {
		// Push services answer with an empty or tiny body; release the connection either way.
		response.body?.cancel().catch(() => undefined);
		if (response.status === 200 || response.status === 201 || response.status === 202) {
			return "sent";
		}
		if (response.status === 404 || response.status === 410) return "gone";
		this.logger.error(`Push to ${hostOf(endpoint)} answered ${response.status}`);
		return "failed";
	}
}

// The endpoint path is a bearer capability for that browser: log only the push service.
function hostOf(endpoint: string): string {
	try {
		return new URL(endpoint).host;
	} catch {
		return "an invalid endpoint";
	}
}
