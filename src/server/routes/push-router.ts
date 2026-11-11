import { Elysia } from "elysia";

import { config } from "../../config";
import { DeletePushSubscription } from "../../modules/push/application/DeletePushSubscription";
import { SavePushSubscription } from "../../modules/push/application/SavePushSubscription";
import {
	DeletePushSubscriptionBodySchema,
	PushPublicKeySchema,
	SavePushSubscriptionBodySchema,
} from "../../modules/push/infrastructure/PushSchemas";
import { PushSubscriptionPostgresRepository } from "../../modules/push/infrastructure/PushSubscriptionPostgresRepository";
import { requireUser as defaultRequireUser } from "../auth/requireUser";
import { emptyOk, errorResponses, jsonOk } from "../openapi/responses";

type Runner<T> = Pick<T, Extract<keyof T, "run">>;

export interface PushRouterDependencies {
	readonly requireUser: typeof defaultRequireUser;
	readonly publicKey: string | null;
	readonly save: Runner<SavePushSubscription>;
	readonly remove: Runner<DeletePushSubscription>;
}

const ENDPOINT_EXAMPLE = "https://fcm.googleapis.com/fcm/send/dX9kZ3Rlc3Q:APA91bH";

export function createPushRouter(deps: PushRouterDependencies) {
	return new Elysia()
		.get("/push/public-key", () => ({ publicKey: deps.publicKey }), {
			detail: {
				tags: ["Push Notifications"],
				summary: "Get the Web Push public key",
				description:
					"The VAPID public key the browser needs to subscribe (`applicationServerKey`). `publicKey` is null when the server has no push keys configured: hide the opt-in control then. Public: no credentials required.",
				responses: {
					200: jsonOk(PushPublicKeySchema, "The public key, or null when push is off", {
						publicKey:
							"BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
					}),
				},
			},
		})
		.guard({}, (app) =>
			app
				.use(deps.requireUser)
				.put(
					"/me/push-subscriptions",
					async ({ userId, body, set }) => {
						await deps.save.run({
							userId,
							endpoint: body.endpoint,
							keys: body.keys,
							locale: body.locale,
						});
						set.status = 204;
					},
					{
						body: SavePushSubscriptionBodySchema,
						detail: {
							tags: ["Push Notifications"],
							summary: "Register this browser for push notifications",
							description:
								"Stores the browser's `PushSubscription` (`subscription.toJSON()` plus the app locale) for the caller. Upserts by endpoint: a browser belongs to the account that registered it last, so calling it after another account signs in moves the subscription. Call it again when the locale or the keys change. The endpoint must be https and the keys base64url.",
							security: [{ bearerAuth: [] }],
							responses: {
								204: emptyOk("The subscription is stored"),
								...errorResponses(401, 403, 422),
							},
						},
					},
				)
				.delete(
					"/me/push-subscriptions",
					async ({ userId, body, set }) => {
						await deps.remove.run({ userId, endpoint: body.endpoint });
						set.status = 204;
					},
					{
						body: DeletePushSubscriptionBodySchema,
						detail: {
							tags: ["Push Notifications"],
							summary: "Stop push notifications on this browser",
							description: `Deletes the caller's subscription for this endpoint (for example \`${ENDPOINT_EXAMPLE}\`); call it on sign-out before dropping the token. Idempotent: an unknown endpoint, or one now owned by another account, answers 204 and changes nothing.`,
							security: [{ bearerAuth: [] }],
							responses: {
								204: emptyOk("The subscription is gone"),
								...errorResponses(401, 403, 422),
							},
						},
					},
				),
		);
}

const subscriptions = new PushSubscriptionPostgresRepository();

export const pushRouter = createPushRouter({
	requireUser: defaultRequireUser,
	publicKey: config.push?.vapidPublicKey ?? null,
	save: new SavePushSubscription(subscriptions),
	remove: new DeletePushSubscription(subscriptions),
});
