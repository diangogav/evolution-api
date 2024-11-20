import { Elysia } from "elysia";

import { BanListGetter } from "../../modules/ban-list/application/BanListGetter";
import { BanListPostgresRepository } from "../../modules/ban-list/infrastructure/BanListPostgresRepository";

const repository = new BanListPostgresRepository();

export const banListRouter = new Elysia({ prefix: "ban-lists" }).get("/", async () => {
	return new BanListGetter(repository).get();
});
