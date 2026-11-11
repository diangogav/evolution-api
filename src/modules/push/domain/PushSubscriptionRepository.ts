import { PushSubscription } from "./PushSubscription";

export interface PushSubscriptionRepository {
	/** Insert or replace by endpoint: the install belongs to whoever subscribed it last. */
	upsert(subscription: PushSubscription): Promise<void>;
	/** Removes the endpoint only if the user owns it; a missing row is not an error. */
	deleteByEndpointForUser(endpoint: string, userId: string): Promise<void>;
	listByUsers(userIds: readonly string[]): Promise<PushSubscription[]>;
	deleteByEndpoint(endpoint: string): Promise<void>;
	/** Records a successful delivery to these endpoints. */
	touch(endpoints: readonly string[], at: Date): Promise<void>;
}
