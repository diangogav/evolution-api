import { PushSubscription } from "./PushSubscription";

export type PushUrgency = "very-low" | "low" | "normal" | "high";

export type PushSendOptions = {
	/** Seconds the push service keeps an undelivered message before dropping it. */
	ttlSeconds: number;
	urgency: PushUrgency;
	/** Replaces an undelivered message with the same topic; at most 32 base64url characters. */
	topic: string;
};

/**
 * `gone`: the push service does not know the subscription anymore (404/410) and the row should go.
 * `failed`: anything else; the subscription may still work next time.
 */
export type PushSendOutcome = "sent" | "gone" | "failed";

export interface PushSender {
	send(
		subscription: Pick<PushSubscription, "endpoint" | "p256dh" | "auth">,
		payload: string,
		options: PushSendOptions,
	): Promise<PushSendOutcome>;
}
