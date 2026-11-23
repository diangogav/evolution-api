import { Elysia } from "elysia";

import { GetMyFormats } from "../../modules/account-formats/application/GetMyFormats";
import { SaveMyFormats } from "../../modules/account-formats/application/SaveMyFormats";
import { AccountFormatsPostgresRepository } from "../../modules/account-formats/infrastructure/AccountFormatsPostgresRepository";
import {
	MyFormatsSchema,
	SaveMyFormatsBodySchema,
	SavedFormatsSchema,
} from "../../modules/account-formats/infrastructure/AccountFormatsSchemas";
import { requireUser as defaultRequireUser } from "../auth/requireUser";
import { errorResponses, jsonOk } from "../openapi/responses";

type Runner<T> = Pick<T, Extract<keyof T, "run">>;

export interface MeFormatsRouterDependencies {
	readonly requireUser: typeof defaultRequireUser;
	readonly get: Runner<GetMyFormats>;
	readonly save: Runner<SaveMyFormats>;
}

const CATALOGUE =
	"Ids: `tcg`, `ocg`, `edison`, `goat`, `jtp`, `jtp-adv-2007-03`, `genesys`, `rush`, `pre`, `speed`.";

export function createMeFormatsRouter(deps: MeFormatsRouterDependencies) {
	return new Elysia({ prefix: "/me/formats" }).guard({}, (app) =>
		app
			.use(deps.requireUser)
			.get("", ({ userId }) => deps.get.run(userId), {
				detail: {
					tags: ["User Management"],
					summary: "Get my formats",
					description: `Formats the caller chose to play, in catalogue order. \`formats\` is null when the player never chose; nothing is inferred from decks or history. An empty list is a choice of none. ${CATALOGUE}`,
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(MyFormatsSchema, "The caller's formats, or null", {
							formats: ["tcg", "goat"],
						}),
						...errorResponses(401, 403, 404),
					},
				},
			})
			// The body is validated by the use case, not by Elysia, so an unknown id or a
			// value that is not a list answers 400 like the rest of the contract.
			.put("", ({ userId, body }) => deps.save.run({ userId, formats: readFormats(body) }), {
				detail: {
					tags: ["User Management"],
					summary: "Choose my formats",
					description: `Replaces the caller's formats with \`formats\`. They are stored deduplicated, in catalogue order, and returned as stored. An empty list is a valid choice. An unknown id, or a \`formats\` that is not a list of ids, answers 400 and keeps the previous choice. ${CATALOGUE}`,
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: true,
						content: { "application/json": { schema: SaveMyFormatsBodySchema } },
					},
					responses: {
						200: jsonOk(SavedFormatsSchema, "The stored formats", { formats: ["tcg", "goat"] }),
						...errorResponses(400, 401, 403, 404),
					},
				},
			}),
	);
}

function readFormats(body: unknown): unknown {
	if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
	return (body as { formats?: unknown }).formats;
}

const repository = new AccountFormatsPostgresRepository();

export const meFormatsRouter = createMeFormatsRouter({
	requireUser: defaultRequireUser,
	get: new GetMyFormats(repository),
	save: new SaveMyFormats(repository),
});
