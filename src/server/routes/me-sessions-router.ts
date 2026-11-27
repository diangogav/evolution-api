import { Elysia } from "elysia";

import { ListMySessions, MySession } from "../../modules/auth/application/ListMySessions";
import { MySessionsSchema } from "../../modules/auth/infrastructure/AuthSchemas";
import { requireUser as defaultRequireUser } from "../auth/requireUser";
import { refreshTokenRepository } from "../composition/sessionTokens";
import { errorResponses, jsonOk } from "../openapi/responses";

export interface MeSessionsRouterDependencies {
	readonly requireUser: typeof defaultRequireUser;
	readonly list: Pick<ListMySessions, "run">;
}

export function createMeSessionsRouter(deps: MeSessionsRouterDependencies) {
	return new Elysia({ prefix: "/me/sessions" }).guard({}, (app) =>
		app
			.use(deps.requireUser)
			.get(
				"",
				async ({ userId, sid }) =>
					(await deps.list.run({ userId, currentSid: sid, now: new Date() })).map(toWire),
				{
					detail: {
						tags: ["Authentication"],
						summary: "List my signed-in devices",
						description:
							"Every sign-in of the caller that can still be renewed, one per device: the calling device first, then by last use. Browser and OS come from the User-Agent the device sent, so they are a hint. A session started before devices were tracked is not marked `current`.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(MySessionsSchema, "The caller's signed-in devices", [
								{
									id: "5b0f8c1e-6f43-4f6e-9a0c-2d7f1a3b9c11",
									browser: "Chrome",
									os: "Android",
									signedInAt: "2026-11-20T18:04:00.000Z",
									lastUsedAt: "2026-11-27T09:30:00.000Z",
									current: true,
								},
							]),
							...errorResponses(401, 403),
						},
					},
				},
			),
	);
}

function toWire(session: MySession) {
	return {
		...session,
		signedInAt: session.signedInAt.toISOString(),
		lastUsedAt: session.lastUsedAt.toISOString(),
	};
}

export const meSessionsRouter = createMeSessionsRouter({
	requireUser: defaultRequireUser,
	list: new ListMySessions(refreshTokenRepository),
});
