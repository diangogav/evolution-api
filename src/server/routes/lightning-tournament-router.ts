import { Elysia } from "elysia";
import { CreateTournamentProxyUseCase } from "../../modules/lightning-tournaments/application/CreateTournamentProxyUseCase";
import { GetRankingUseCase } from "../../modules/lightning-tournaments/application/GetRankingUseCase";
import { UpdateRankingUseCase } from "../../modules/lightning-tournaments/application/UpdateRankingUseCase";
import { LightningTournamentController } from "../../modules/lightning-tournaments/infrastructure/LightningTournamentController";
import { LightningRankingPostgresRepository } from "../../modules/lightning-tournaments/infrastructure/LightningRankingPostgresRepository";
import { UserPostgresRepository } from "../../modules/user/infrastructure/UserPostgresRepository";
import { config } from "src/config";
import { Pino } from "src/shared/logger/infrastructure/Pino";
import { TournamentEnrollmentUseCase } from "src/modules/lightning-tournaments/application/TournamentEnrollmentUseCase";
import { TournamentGateway } from "src/modules/lightning-tournaments/infrastructure/TournamentGateway";
import { JWT } from "src/shared/JWT";

const logger = new Pino();
const repository = new LightningRankingPostgresRepository();
const userRepository = new UserPostgresRepository();
const tournamentRepository = new TournamentGateway();
const updateRanking = new UpdateRankingUseCase(repository, userRepository, logger);
const getRanking = new GetRankingUseCase(repository);
const tournamentEnrollmentUseCase = new TournamentEnrollmentUseCase(userRepository, tournamentRepository);
const jwt = new JWT(config.jwt)

// Webhook URL will be dynamically generated in the controller based on request origin
const createTournament = new CreateTournamentProxyUseCase(
    config.tournaments.apiUrl,
    config.tournaments.webhookUrl,
);

const controller = new LightningTournamentController(
    updateRanking,
    getRanking,
    createTournament,
    tournamentEnrollmentUseCase,
    jwt
);

export const lightningTournamentRouter = new Elysia().use(
    controller.routes(new Elysia())
);
