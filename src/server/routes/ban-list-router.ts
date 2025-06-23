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
		query: t.Object({
			season: t.Number({ default: config.season }),
		}),
	},
);
