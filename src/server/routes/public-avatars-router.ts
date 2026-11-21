import { Elysia, t } from "elysia";

import {
	GetAvatarsByUserIds,
	MAX_AVATAR_LOOKUP,
} from "../../modules/player-avatars/application/GetAvatarsByUserIds";
import { PlayerAvatarPostgresRepository } from "../../modules/player-avatars/infrastructure/PlayerAvatarPostgresRepository";
import { PublicAvatarsSchema } from "../../modules/player-avatars/infrastructure/PlayerAvatarSchemas";
import { errorResponses, jsonOk } from "../openapi/responses";

const getAvatarsByUserIds = new GetAvatarsByUserIds(new PlayerAvatarPostgresRepository());

export const publicAvatarsRouter = new Elysia().get(
	"/avatars",
	({ query, set }) => {
		// Avatars change rarely and pages like the ranking ask for the same players often.
		set.headers["Cache-Control"] = "public, max-age=60";
		return getAvatarsByUserIds.run(query.userIds);
	},
	{
		query: t.Object({ userIds: t.String({ maxLength: 4000 }) }),
		detail: {
			tags: ["User Management"],
			summary: "Get the avatars of several players",
			description: `Public avatars of up to ${MAX_AVATAR_LOOKUP} players in one call, by user id (comma-separated). Players without an avatar and unknown ids are left out; clients show initials for them.`,
			responses: {
				200: jsonOk(PublicAvatarsSchema, "Avatars retrieved successfully", {
					avatars: [
						{ userId: "c1310dd9-7a15-449a-99ec-08519391839d", config: { hairStyle: "spiky" } },
					],
				}),
				...errorResponses(400, 422),
			},
		},
	},
);
