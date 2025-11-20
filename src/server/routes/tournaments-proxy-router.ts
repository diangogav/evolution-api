import { Elysia } from "elysia";
import { TournamentsProxyController } from "../../modules/lightning-tournaments/infrastructure/TournamentsProxyController";
import { config } from "src/config";

const controller = new TournamentsProxyController(config.tournaments.apiUrl);

export const tournamentsProxyRouter = new Elysia().use(
    controller.routes(new Elysia())
);
