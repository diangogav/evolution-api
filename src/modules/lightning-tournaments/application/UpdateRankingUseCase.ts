import { TournamentRanking } from "../domain/TournamentRanking";
import { TournamentRankingRepository } from "../domain/TournamentRankingRepository";
import { UserRepository } from "../../user/domain/UserRepository";
import { Logger } from "src/shared/logger/domain/Logger";
import { NotFoundError } from "src/shared/errors/NotFoundError";

export class UpdateRankingUseCase {
    constructor(
        private readonly repository: TournamentRankingRepository,
        private readonly userRepository: UserRepository,
        private readonly logger: Logger,
    ) { }

    async execute(input: { participantId: string; points: number }): Promise<void> {
        this.logger.info(`[UpdateRanking] Received participantId: ${input.participantId}`);

        // 1. Find user by participantId
        const user = await this.userRepository.findByParticipantId(input.participantId);
        if (!user) {
            throw new NotFoundError(`User not found for participantId: ${input.participantId}`);
        }

        this.logger.info(`[UpdateRanking] Found user ${user.id} for participant ${input.participantId}`);

        // 2. Find or create ranking
        let ranking = await this.repository.findByUserId(user.id);

        if (!ranking) {
            this.logger.info(`[UpdateRanking] Creating new ranking for user ${user.id}`);
            ranking = TournamentRanking.createNew(user.id);
        }

        // 3. Update ranking
        ranking.addWin(input.points);
        await this.repository.save(ranking);
        this.logger.info(`[UpdateRanking] Ranking saved for user ${user.id}`);
    }
}
