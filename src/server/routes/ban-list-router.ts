import { Elysia, t } from "elysia";
import { config } from "./../../config/index";

import { BanListGetter } from "../../modules/ban-list/application/BanListGetter";
import { GroupedBanListGetter } from "../../modules/ban-list/application/GroupedBanListGetter";
import { BanListPostgresRepository } from "../../modules/ban-list/infrastructure/BanListPostgresRepository";

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
					200: {
						description: "Ban lists retrieved successfully",
						content: {
							"application/json": {
								example: [
									{
										id: "banlist-1",
										name: "Edison",
										season: 1,
										description: "Edison format ban list",
									},
									{
										id: "banlist-2",
										name: "TCG",
										season: 1,
										description: "TCG format ban list",
									},
								],
							},
						},
					},
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
					200: {
						description: "Grouped ban lists retrieved successfully",
						content: {
							"application/json": {
								example: [
									{ name: "Global", type: "global", banLists: [] },
									{
										name: "Edison",
										type: "group",
										banLists: ["March 2010 Edison", "September 2009 Edison"],
									},
									{ name: "TCG", type: "banlist", banLists: [] },
								],
							},
						},
					},
				},
			},
			query: t.Object({
				season: t.Number({ default: config.season }),
			}),
		},
	);
