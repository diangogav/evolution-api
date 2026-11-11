import { t } from "elysia";

import {
	MAX_AUTH_LENGTH,
	MAX_ENDPOINT_LENGTH,
	MAX_P256DH_LENGTH,
} from "../domain/PushSubscription";

export const PushPublicKeySchema = t.Object({
	publicKey: t.Union([t.String(), t.Null()], {
		description:
			"VAPID application server key (base64url) to pass to `pushManager.subscribe`; null when push is not configured",
	}),
});

export const SavePushSubscriptionBodySchema = t.Object({
	endpoint: t.String({
		minLength: 1,
		maxLength: MAX_ENDPOINT_LENGTH,
		description: "The push service URL from `PushSubscription.endpoint`; must be https",
	}),
	keys: t.Object({
		p256dh: t.String({ minLength: 1, maxLength: MAX_P256DH_LENGTH, description: "base64url" }),
		auth: t.String({ minLength: 1, maxLength: MAX_AUTH_LENGTH, description: "base64url" }),
	}),
	locale: t.String({
		maxLength: 35,
		description:
			"Language of the notification text: any `es*` tag reads Spanish, anything else English",
	}),
});

export const DeletePushSubscriptionBodySchema = t.Object({
	endpoint: t.String({ minLength: 1, maxLength: MAX_ENDPOINT_LENGTH }),
});
