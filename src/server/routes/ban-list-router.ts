import { Elysia, t } from "elysia";
import { config } from "./../../config/index";

import { BanListGetter } from "../../modules/ban-list/application/BanListGetter";
import { BanListPostgresRepository } from "../../modules/ban-list/infrastructure/BanListPostgresRepository";

const repository = new BanListPostgresRepository();

export const banListRouter = new Elysia({ prefix: "ban-lists" }).get(
	"/",
	async ({ query }) => {
		return new BanListGetter(repository).get(query.season);
	},
	{
		detail: {
			tags: ['Ban Lists'],
			summary: 'Get ban lists',
			description: 'Retrieves all ban lists for a specific season',
			responses: {
				200: {
					description: 'Ban lists retrieved successfully',
					content: {
						'application/json': {
							example: [
								{
									id: 'banlist-1',
									name: 'Edison',
									season: 1,
									description: 'Edison format ban list'
								},
								{
									id: 'banlist-2',
									name: 'TCG',
									season: 1,
									description: 'TCG format ban list'
								}
							]
						}
					}
				}
			}
		},
		query: t.Object({
			season: t.Number({ default: config.season }),
		}),
	},
);
