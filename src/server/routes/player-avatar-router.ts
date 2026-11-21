import { Elysia } from "elysia";

import { requireUser } from "../auth/requireUser";
import { DeleteMyAvatar } from "../../modules/player-avatars/application/DeleteMyAvatar";
import { GetMyAvatar } from "../../modules/player-avatars/application/GetMyAvatar";
import { SaveMyAvatar } from "../../modules/player-avatars/application/SaveMyAvatar";
import { PlayerAvatarPostgresRepository } from "../../modules/player-avatars/infrastructure/PlayerAvatarPostgresRepository";
import {
	AvatarConfigSchema,
	MyAvatarSchema,
} from "../../modules/player-avatars/infrastructure/PlayerAvatarSchemas";
import { emptyOk, errorResponses, jsonOk } from "../openapi/responses";

const avatars = new PlayerAvatarPostgresRepository();
const getMyAvatar = new GetMyAvatar(avatars);
const saveMyAvatar = new SaveMyAvatar(avatars);
const deleteMyAvatar = new DeleteMyAvatar(avatars);

const example = {
	config: { hairStyle: "spiky", hairColor: "purple", eyeStyle: "sharp", shirtLogo: "evolution" },
};

export const playerAvatarRouter = new Elysia({ prefix: "/me/avatar" }).guard({}, (app) =>
	app
		.use(requireUser)
		.get("/", ({ userId }) => getMyAvatar.run(userId), {
			detail: {
				tags: ["User Management"],
				summary: "Get my avatar",
				description:
					"Returns the choices of the authenticated user's bust avatar, as saved from the web. 404 when they have none and show their initials.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: jsonOk(MyAvatarSchema, "Avatar retrieved successfully", example),
					...errorResponses(401, 403, 404),
				},
			},
		})
		.put("/", ({ userId, body }) => saveMyAvatar.run({ userId, config: body }), {
			body: AvatarConfigSchema,
			detail: {
				tags: ["User Management"],
				summary: "Save my avatar",
				description:
					"Replaces the whole avatar. Only the shape is checked: at most 24 choices, part names of 1-24 letters, values of 1-32 lowercase letters, digits or hyphens. The web owns the catalog of options.",
				security: [{ bearerAuth: [] }],
				responses: {
					200: jsonOk(MyAvatarSchema, "Avatar saved", example),
					...errorResponses(400, 401, 403, 422),
				},
			},
		})
		.delete(
			"/",
			async ({ userId, set }) => {
				await deleteMyAvatar.run(userId);
				set.status = 204;
			},
			{
				detail: {
					tags: ["User Management"],
					summary: "Remove my avatar",
					description:
						"Deletes the authenticated user's avatar so they show their initials again. Succeeds when there was none.",
					security: [{ bearerAuth: [] }],
					responses: {
						204: emptyOk("Avatar removed"),
						...errorResponses(401, 403),
					},
				},
			},
		),
);
