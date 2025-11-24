import { UserRepository } from "src/modules/user/domain/UserRepository";
import { NotFoundError } from "src/shared/errors/NotFoundError";
import { TournamentRepository } from "../domain/TournamentRepository";

export class TournamentWithdrawalUseCase {
    constructor(private readonly userRepository: UserRepository, private readonly tournamentRepository: TournamentRepository) { }

    async execute({ userId, tournamentId }: { userId: string; tournamentId: string }): Promise<void> {
        const user = await this.userRepository.findById(userId)
        if (!user) {
            throw new NotFoundError(`User with id: ${userId} not found`)
        }

        if (!user.participantId) {
            throw new Error("User is not a participant")
        }

        await this.tournamentRepository.withdrawTournament(tournamentId, user.participantId);

    }
}
