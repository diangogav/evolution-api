import { pushSubscription } from "../domain/PushSubscription";
import { PushSubscriptionRepository } from "../domain/PushSubscriptionRepository";

export type SavePushSubscriptionInput = {
	userId: string;
	endpoint: string;
	keys: { p256dh: string; auth: string };
	locale?: string | null;
};

export class SavePushSubscription {
	constructor(private readonly subscriptions: PushSubscriptionRepository) {}

	async run(input: SavePushSubscriptionInput): Promise<void> {
		await this.subscriptions.upsert(
			pushSubscription({
				userId: input.userId,
				endpoint: input.endpoint,
				p256dh: input.keys.p256dh,
				auth: input.keys.auth,
				locale: input.locale,
			}),
		);
	}
}
