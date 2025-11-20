import { UserRepository } from "src/modules/user/domain/UserRepository";
import { NotFoundError } from "src/shared/errors/NotFoundError";
import { TournamentRepository } from "../domain/TournamentRepository";

export class TournamentEnrollmentUseCase {
    constructor(private readonly userRepository: UserRepository, private readonly tournamentRepository: TournamentRepository) { }

    async execute({ userId, tournamentId }: { userId: string; tournamentId: string }): Promise<void> {
        const user = await this.userRepository.findById(userId)
        if (!user) {
            throw new NotFoundError(`User with id: ${userId} not found`)
        }

        if (!user.participantId) {
            const participantId = await this.tournamentRepository.createUserTournament({ displayName: user.username, email: user.email });
            await this.userRepository.updateParticipantId(userId, participantId);
            await this.tournamentRepository.enrollTournament({ tournamentId, participantId });
            return
        }

        await this.tournamentRepository.enrollTournament({ tournamentId, participantId: user.participantId });

    }
}