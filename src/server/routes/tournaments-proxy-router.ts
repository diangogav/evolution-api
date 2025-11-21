import { Elysia } from "elysia";
import { TournamentsProxyController } from "../../modules/lightning-tournaments/infrastructure/TournamentsProxyController";
import { TournamentGateway } from "../../modules/lightning-tournaments/infrastructure/TournamentGateway";
import { config } from "src/config";
import { JWT } from "src/shared/JWT";

const jwt = new JWT(config.jwt);
const tournamentGateway = new TournamentGateway();
const controller = new TournamentsProxyController(jwt, tournamentGateway);

export const tournamentsProxyRouter = new Elysia().use(
    controller.routes(new Elysia())
);
