import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { normalizePushLocale, PushSubscription } from "../domain/PushSubscription";
import { PushSubscriptionRepository } from "../domain/PushSubscriptionRepository";

// The endpoint identifies the browser install, so a second account signing in on the same
// browser takes the row over instead of adding one.
const UPSERT_QUERY = `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, locale)
	VALUES ($1, $2, $3, $4, $5)
	ON CONFLICT (endpoint) DO UPDATE SET
		user_id = EXCLUDED.user_id,
		p256dh = EXCLUDED.p256dh,
		auth = EXCLUDED.auth,
		locale = EXCLUDED.locale`;

const DELETE_FOR_USER_QUERY = `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`;

const LIST_BY_USERS_QUERY = `SELECT user_id, endpoint, p256dh, auth, locale FROM push_subscriptions
	WHERE user_id = ANY($1::varchar[]) ORDER BY user_id, created_at`;

const DELETE_QUERY = `DELETE FROM push_subscriptions WHERE endpoint = $1`;

const TOUCH_QUERY = `UPDATE push_subscriptions SET last_used_at = $2 WHERE endpoint = ANY($1::text[])`;

type Row = { user_id: string; endpoint: string; p256dh: string; auth: string; locale: string };

export class PushSubscriptionPostgresRepository implements PushSubscriptionRepository {
	constructor(private readonly manager?: QueryableManager) {}

	async upsert(subscription: PushSubscription): Promise<void> {
		await runQuery(
			UPSERT_QUERY,
			[
				subscription.userId,
				subscription.endpoint,
				subscription.p256dh,
				subscription.auth,
				subscription.locale,
			],
			this.manager,
		);
	}

	async deleteByEndpointForUser(endpoint: string, userId: string): Promise<void> {
		await runQuery(DELETE_FOR_USER_QUERY, [endpoint, userId], this.manager);
	}

	async listByUsers(userIds: readonly string[]): Promise<PushSubscription[]> {
		if (userIds.length === 0) return [];
		const rows = await runQuery<Row>(LIST_BY_USERS_QUERY, [[...new Set(userIds)]], this.manager);
		return rows.map((row) => ({
			userId: row.user_id,
			endpoint: row.endpoint,
			p256dh: row.p256dh,
			auth: row.auth,
			locale: normalizePushLocale(row.locale),
		}));
	}

	async deleteByEndpoint(endpoint: string): Promise<void> {
		await runQuery(DELETE_QUERY, [endpoint], this.manager);
	}

	async touch(endpoints: readonly string[], at: Date): Promise<void> {
		if (endpoints.length === 0) return;
		await runQuery(TOUCH_QUERY, [[...new Set(endpoints)], at], this.manager);
	}
}
