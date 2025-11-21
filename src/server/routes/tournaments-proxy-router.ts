import { Elysia } from "elysia";
import { TournamentsProxyController } from "../../modules/lightning-tournaments/infrastructure/TournamentsProxyController";
import { config } from "src/config";
import { JWT } from "src/shared/JWT";

const jwt = new JWT(config.jwt);
const controller = new TournamentsProxyController(config.tournaments.apiUrl, jwt);

export const tournamentsProxyRouter = new Elysia().use(
    controller.routes(new Elysia())
);
