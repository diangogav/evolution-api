import { UserRepository } from "../../user/domain/UserRepository";
import { TournamentRankingRepository } from "../domain/TournamentRankingRepository";
import { TournamentRanking } from "../domain/TournamentRanking";
import { Logger } from "src/shared/logger/domain/Logger";

// Fixed points distribution by position
const POINTS_BY_POSITION: Record<number, number> = {
    1: 10,  // 1st place
    2: 7,   // 2nd place
    3: 5,   // 3rd place
    4: 3,   // 4th place
    5: 2,   // 5th-8th place
    6: 2,
    7: 2,
    8: 2,
};

interface MatchParticipant {
    participantId: string;
    score: number | null;
    result: "win" | "loss" | "draw" | null;
}

interface Match {
    id: string;
    roundNumber: number;
    completedAt: string | null;
    participants: MatchParticipant[];
}

interface RankingEntry {
    participantId: string;
    position: number;
}

export class UpdateRankingUseCase {
    constructor(
        private readonly repository: TournamentRankingRepository,
        private readonly userRepository: UserRepository,
        private readonly tournamentsApiUrl: string,
        private readonly logger: Logger
    ) { }

    async execute(input: { tournamentId: string }): Promise<void> {
        this.logger.info(`[UpdateRanking] Processing tournament: ${input.tournamentId}`);

        // Fetch all matches from tournaments service
        const matches = await this.fetchTournamentMatches(input.tournamentId);
        this.logger.info(`[UpdateRanking] Found ${matches.length} matches`);

        // Calculate final rankings
        const rankings = this.calculateRankings(matches);
        this.logger.debug(`[UpdateRanking] Calculated rankings: ${JSON.stringify(rankings)}`);


        // Update points for each participant
        for (const ranking of rankings) {
            const points = POINTS_BY_POSITION[ranking.position] || 1;
            const isWinner = ranking.position === 1;

            // Find user by participantId
            const user = await this.userRepository.findByParticipantId(ranking.participantId);
            if (!user) {
                this.logger.error(`[UpdateRanking] User not found for participant ${ranking.participantId}`);
                continue;
            }

            this.logger.info(`[UpdateRanking] Updating user ${user.id}: position ${ranking.position}, points ${points}`);


            // Get or create ranking
            let userRanking = await this.repository.findByUserId(user.id);

            if (!userRanking) {
                userRanking = TournamentRanking.createNew({
                    userId: user.id,
                    points,
                    tournamentsWon: isWinner ? 1 : 0,
                    tournamentsPlayed: 1,
                });
            } else {
                userRanking = userRanking.addPoints(points);
                userRanking = userRanking.incrementTournamentsPlayed();
                if (isWinner) {
                    userRanking = userRanking.incrementTournamentsWon();
                }
            }

            await this.repository.save(userRanking);
            this.logger.info(`[UpdateRanking] Saved ranking for user ${user.id}`);
        }
    }

    private async fetchTournamentMatches(tournamentId: string): Promise<Match[]> {
        const response = await fetch(`${this.tournamentsApiUrl}/tournaments/${tournamentId}/matches`);
        if (!response.ok) {
            throw new Error(`Failed to fetch matches: ${response.status}`);
        }
        return await response.json();
    }

    private calculateRankings(matches: Match[]): RankingEntry[] {
        // For single elimination, we can determine positions from the bracket structure
        // The winner of the final (highest round) is 1st
        // The loser of the final is 2nd
        // The losers of semi-finals are tied 3rd
        // etc.

        const maxRound = Math.max(...matches.map(m => m.roundNumber));
        const rankings: RankingEntry[] = [];

        // Process rounds from final to first
        for (let round = maxRound; round >= 1; round--) {
            const roundMatches = matches.filter(m => m.roundNumber === round && m.completedAt);

            for (const match of roundMatches) {
                const winner = match.participants.find(p => p.result === "win");
                const loser = match.participants.find(p => p.result === "loss");

                if (round === maxRound) {
                    // Final match
                    if (winner) rankings.push({ participantId: winner.participantId, position: 1 });
                    if (loser) rankings.push({ participantId: loser.participantId, position: 2 });
                } else {
                    // For earlier rounds, losers get positions based on round
                    // Semi-final losers: 3rd place
                    // Quarter-final losers: 5th place
                    const position = Math.pow(2, maxRound - round) + 1;
                    if (loser && !rankings.find(r => r.participantId === loser.participantId)) {
                        rankings.push({ participantId: loser.participantId, position });
                    }
                }
            }
        }

        return rankings;
    }
}
