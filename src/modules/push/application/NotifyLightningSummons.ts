import { Logger } from "../../../shared/logger/domain/Logger";
import { lightningSummonsText } from "../domain/lightningSummonsText";
import { PushSender } from "../domain/PushSender";
import { PushSubscription } from "../domain/PushSubscription";
import { PushSubscriptionRepository } from "../domain/PushSubscriptionRepository";
import { pushTopic } from "../domain/pushTopic";

/** One issued reservation whose seats are called to their duel. */
export type LightningSummonsNotice = {
	tournamentId: string;
	tournamentName: string;
	reservationId: string;
	userIds: readonly string[];
	lobbyTimeoutSeconds: number;
};

export type LightningSummonsPayload = {
	type: "lightning-summons";
	tournamentId: string;
	reservationId: string;
	title: string;
	body: string;
	url: string;
};

export const LIGHTNING_SUMMONS_TOPIC = "lightning-summons";
export const DEFAULT_SEND_CONCURRENCY = 8;

type Delivery = { subscription: PushSubscription; payload: string; notice: LightningSummonsNotice };

/**
 * Sends a push to every subscription of every seat of the given reservations. Best effort:
 * no retries (the push is useless once the lobby timeout passes, which is also its TTL),
 * subscriptions the push service reports gone are deleted, delivered ones are stamped, and
 * nothing is ever thrown to the caller.
 */
export class NotifyLightningSummons {
	constructor(
		private readonly subscriptions: PushSubscriptionRepository,
		private readonly sender: PushSender,
		private readonly logger: Logger,
		private readonly concurrency: number = DEFAULT_SEND_CONCURRENCY,
	) {}

	async run(summons: readonly LightningSummonsNotice[], now: Date): Promise<void> {
		try {
			await this.deliver(summons, now);
		} catch (error) {
			this.logger.error(`Lightning summons push failed: ${errorMessage(error)}`);
		}
	}

	private async deliver(summons: readonly LightningSummonsNotice[], now: Date): Promise<void> {
		const userIds = [...new Set(summons.flatMap((notice) => notice.userIds))];
		if (userIds.length === 0) return;
		const byUser = new Map<string, PushSubscription[]>();
		for (const subscription of await this.subscriptions.listByUsers(userIds)) {
			byUser.set(subscription.userId, [...(byUser.get(subscription.userId) ?? []), subscription]);
		}

		const deliveries: Delivery[] = summons.flatMap((notice) =>
			[...new Set(notice.userIds)].flatMap((userId) =>
				(byUser.get(userId) ?? []).map((subscription) => ({
					subscription,
					notice,
					payload: JSON.stringify(payloadFor(notice, subscription)),
				})),
			),
		);

		const sent: string[] = [];
		const gone: string[] = [];
		let failed = 0;
		await forEachWithConcurrency(deliveries, this.concurrency, async (delivery) => {
			const outcome = await this.sender
				.send(delivery.subscription, delivery.payload, {
					ttlSeconds: delivery.notice.lobbyTimeoutSeconds,
					urgency: "high",
					topic: pushTopic(LIGHTNING_SUMMONS_TOPIC, delivery.notice.reservationId),
				})
				.catch(() => "failed" as const);
			if (outcome === "sent") sent.push(delivery.subscription.endpoint);
			else if (outcome === "gone") gone.push(delivery.subscription.endpoint);
			else failed++;
		});

		for (const endpoint of gone) {
			await this.subscriptions
				.deleteByEndpoint(endpoint)
				.catch((error) =>
					this.logger.error(`Could not delete a gone push subscription: ${errorMessage(error)}`),
				);
		}
		if (sent.length > 0) {
			await this.subscriptions
				.touch(sent, now)
				.catch((error) =>
					this.logger.error(`Could not stamp delivered push subscriptions: ${errorMessage(error)}`),
				);
		}
		if (failed > 0) {
			this.logger.error(
				`Lightning summons push: ${failed} of ${deliveries.length} message(s) failed`,
			);
		}
	}
}

function payloadFor(
	notice: LightningSummonsNotice,
	subscription: PushSubscription,
): LightningSummonsPayload {
	const text = lightningSummonsText(subscription.locale, notice);
	return {
		type: "lightning-summons",
		tournamentId: notice.tournamentId,
		reservationId: notice.reservationId,
		title: text.title,
		body: text.body,
		url: `/lightning/${notice.tournamentId}`,
	};
}

async function forEachWithConcurrency<T>(
	items: readonly T[],
	limit: number,
	work: (item: T) => Promise<void>,
): Promise<void> {
	let next = 0;
	const lane = async () => {
		while (next < items.length) {
			const item = items[next++];
			await work(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, lane));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
