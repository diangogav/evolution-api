import { PushSubscriptionRepository } from "../domain/PushSubscriptionRepository";

export type DeletePushSubscriptionInput = { userId: string; endpoint: string };

// Idempotent and scoped to the caller: deleting an unknown endpoint, or one that moved to
// another account on the same browser, succeeds without touching anything.
export class DeletePushSubscription {
	constructor(private readonly subscriptions: PushSubscriptionRepository) {}

	async run(input: DeletePushSubscriptionInput): Promise<void> {
		await this.subscriptions.deleteByEndpointForUser(input.endpoint, input.userId);
	}
}
