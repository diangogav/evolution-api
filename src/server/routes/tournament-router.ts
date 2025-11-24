import { Elysia } from "elysia";
import { CreateTournamentProxyUseCase } from "../../modules/tournaments/application/CreateTournamentProxyUseCase";
import { GetRankingUseCase } from "../../modules/tournaments/application/GetRankingUseCase";
import { UpdateRankingUseCase } from "../../modules/tournaments/application/UpdateRankingUseCase";
import { TournamentController } from "../../modules/tournaments/infrastructure/TournamentController";
import { TournamentRankingPostgresRepository } from "../../modules/tournaments/infrastructure/TournamentRankingPostgresRepository";
import { UserPostgresRepository } from "../../modules/user/infrastructure/UserPostgresRepository";
import { config } from "src/config";
import { TournamentEnrollmentUseCase } from "src/modules/tournaments/application/TournamentEnrollmentUseCase";
import { TournamentWithdrawalUseCase } from "src/modules/tournaments/application/TournamentWithdrawalUseCase";
import { TournamentGateway } from "src/modules/tournaments/infrastructure/TournamentGateway";
import { JWT } from "src/shared/JWT";
import { Pino } from "src/shared/logger/infrastructure/Pino";

const logger = new Pino();
const repository = new TournamentRankingPostgresRepository();
const userRepository = new UserPostgresRepository();
const tournamentRepository = new TournamentGateway();
const updateRanking = new UpdateRankingUseCase(
    repository,
    userRepository,
    config.tournaments.apiUrl,
    logger
);
const getRanking = new GetRankingUseCase(repository);
const tournamentEnrollmentUseCase = new TournamentEnrollmentUseCase(userRepository, tournamentRepository);
const tournamentWithdrawalUseCase = new TournamentWithdrawalUseCase(userRepository, tournamentRepository);
const jwt = new JWT(config.jwt)

// Webhook URL will be dynamically generated in the controller based on request origin
const createTournament = new CreateTournamentProxyUseCase(
    config.tournaments.apiUrl,
    config.tournaments.webhookUrl,
);

const controller = new TournamentController(
    updateRanking,
    getRanking,
    createTournament,
    tournamentEnrollmentUseCase,
    tournamentWithdrawalUseCase,
    jwt
);

export const tournamentRouter = new Elysia().use(
    controller.routes(new Elysia())
);
