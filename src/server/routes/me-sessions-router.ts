import { Elysia, t } from "elysia";

import { ListMySessions, MySession } from "../../modules/auth/application/ListMySessions";
import { RevokeMyOtherSessions } from "../../modules/auth/application/RevokeMyOtherSessions";
import { RevokeMySession } from "../../modules/auth/application/RevokeMySession";
import { MySessionsSchema } from "../../modules/auth/infrastructure/AuthSchemas";
import { requireUser as defaultRequireUser } from "../auth/requireUser";
import { refreshTokenRepository, revokeSessions } from "../composition/sessionTokens";
import { emptyOk, errorResponses, jsonOk } from "../openapi/responses";

export interface MeSessionsRouterDependencies {
	readonly requireUser: typeof defaultRequireUser;
	readonly list: Pick<ListMySessions, "run">;
	readonly revoke: Pick<RevokeMySession, "run">;
	readonly revokeOthers: Pick<RevokeMyOtherSessions, "run">;
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
			)
			.delete(
				"",
				async ({ userId, sid, set }) => {
					await deps.revokeOthers.run({ userId, currentSid: sid, now: new Date() });
					set.status = 204;
				},
				{
					detail: {
						tags: ["Authentication"],
						summary: "Sign out my other devices",
						description:
							"Ends every sign-in of the caller except the calling one: their refresh tokens stop working and their JWTs are refused from the next request. A JWT issued before devices were tracked has no sign-in id, so the call then ends every sign-in, the calling one included. Idempotent.",
						security: [{ bearerAuth: [] }],
						responses: {
							204: emptyOk("Every other device is signed out"),
							...errorResponses(401, 403),
						},
					},
				},
			)
			.delete(
				"/:id",
				async ({ userId, params, set }) => {
					await deps.revoke.run({ userId, sessionId: params.id, now: new Date() });
					set.status = 204;
				},
				{
					params: t.Object({ id: t.String({ minLength: 1, maxLength: 64 }) }),
					detail: {
						tags: ["Authentication"],
						summary: "Sign out one of my devices",
						description:
							"Ends one sign-in of the caller, the calling one included: its refresh tokens stop working and its JWTs are refused from the next request. Answers 404 when the id is not a live sign-in of the caller.",
						security: [{ bearerAuth: [] }],
						responses: {
							204: emptyOk("The device is signed out"),
							...errorResponses(401, 403, 404, 422),
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
	revoke: new RevokeMySession(refreshTokenRepository, revokeSessions),
	revokeOthers: new RevokeMyOtherSessions(revokeSessions),
});
