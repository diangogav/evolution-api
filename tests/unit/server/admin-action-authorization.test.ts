import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { config } from "../../../src/config";
import { UserProfileRole } from "../../../src/evolution-types/src/types/UserProfileRole";
import { mapDomainErrorStatus, mountApiV1Routes } from "../../../src/server/server";
import { JWT } from "../../../src/shared/JWT";

const nonAdminToken = new JWT(config.jwt).generate({ id: "user-1", role: UserProfileRole.USER });

const tournamentBody = {
	name: "Weekly",
	discipline: "yugioh",
	format: "single elimination",
	status: "pending",
	participantType: "single",
	allowMixedParticipants: false,
	maxParticipants: 8,
};

const matchResultBody = {
	participants: [
		{ participantId: "participant-1", score: 2 },
		{ participantId: "participant-2", score: 1 },
	],
};

const adminActions: { name: string; method: string; path: string; body?: unknown }[] = [
	{ name: "ban a user", method: "POST", path: "/users/user-2/ban", body: { reason: "cheating" } },
	{ name: "unban a user", method: "POST", path: "/users/user-2/unban" },
	{ name: "view an active ban", method: "GET", path: "/users/user-2/ban/active" },
	{ name: "view ban history", method: "GET", path: "/users/user-2/ban/history" },
	{ name: "create a tournament", method: "POST", path: "/tournaments", body: tournamentBody },
	{ name: "generate a bracket", method: "POST", path: "/tournaments/t-1/bracket" },
	{
		name: "record a match result",
		method: "POST",
		path: "/tournaments/t-1/matches/m-1/result",
		body: matchResultBody,
	},
	{ name: "annul a match result", method: "DELETE", path: "/tournaments/t-1/matches/m-1/result" },
];

function buildApp() {
	const app = new Elysia().onError(mapDomainErrorStatus);
	mountApiV1Routes(app);
	return app;
}

describe("admin actions called by an authenticated non-admin", () => {
	const app = buildApp();

	for (const action of adminActions) {
		it(`answers 403 when a non-admin tries to ${action.name}`, async () => {
			const headers: Record<string, string> = { Authorization: `Bearer ${nonAdminToken}` };
			if (action.body) headers["Content-Type"] = "application/json";

			const response = await app.handle(
				new Request(`http://localhost/api/v1${action.path}`, {
					method: action.method,
					headers,
					body: action.body ? JSON.stringify(action.body) : undefined,
				}),
			);

			expect(response.status).toBe(403);
		});
	}
});
