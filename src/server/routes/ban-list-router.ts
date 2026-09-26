import { Elysia, t } from "elysia";
import { config } from "./../../config/index";

import { BanListGetter } from "../../modules/ban-list/application/BanListGetter";
import { GroupedBanListGetter } from "../../modules/ban-list/application/GroupedBanListGetter";
import { BanListPostgresRepository } from "../../modules/ban-list/infrastructure/BanListPostgresRepository";
import {
	BanListNamesSchema,
	GroupedBanListsSchema,
} from "../../modules/ban-list/infrastructure/BanListSchemas";
import { errorResponses, jsonOk } from "../openapi/responses";

const repository = new BanListPostgresRepository();

export const banListRouter = new Elysia({ prefix: "ban-lists" })
	.get(
		"/",
		async ({ query }) => {
			return new BanListGetter(repository).get(query.season);
		},
		{
			detail: {
				tags: ["Ban Lists"],
				summary: "Get ban lists",
				description: "Retrieves all ban lists for a specific season",
				responses: {
					200: jsonOk(BanListNamesSchema, "Ban lists retrieved successfully", ["Edison", "TCG"]),
					...errorResponses(422),
				},
			},
			query: t.Object({
				season: t.Number({ default: config.season }),
			}),
		},
	)
	.get(
		"/grouped",
		async ({ query }) => {
			return new GroupedBanListGetter(repository).get(query.season);
		},
		{
			detail: {
				tags: ["Ban Lists"],
				summary: "Get grouped ban lists",
				description:
					"Retrieves the ban lists played during a season as ordered sections: the global rank first, then every group with the ban lists it contains, then the ban lists no group matched. Every section name is a valid banListName for the leaderboard endpoint.",
				responses: {
					200: jsonOk(GroupedBanListsSchema, "Grouped ban lists retrieved successfully", [
						{ name: "Global", type: "global", banLists: [] },
						{
							name: "Edison",
							type: "group",
							banLists: ["March 2010 Edison", "September 2009 Edison"],
						},
						{ name: "TCG", type: "banlist", banLists: [] },
					]),
					...errorResponses(422),
				},
			},
			query: t.Object({
				season: t.Number({ default: config.season }),
			}),
		},
	);
