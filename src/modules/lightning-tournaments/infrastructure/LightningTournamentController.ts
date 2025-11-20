import { Elysia, t } from "elysia";
import { UpdateRankingUseCase } from "../application/UpdateRankingUseCase";
import { GetRankingUseCase } from "../application/GetRankingUseCase";
import { CreateTournamentInput, CreateTournamentProxyUseCase } from "../application/CreateTournamentProxyUseCase";
import { UserRepository } from "../../user/domain/UserRepository";

export class LightningTournamentController {
    constructor(
        private readonly updateRanking: UpdateRankingUseCase,
        private readonly getRanking: GetRankingUseCase,
        private readonly createTournament: CreateTournamentProxyUseCase,
        private readonly userRepository: UserRepository
    ) { }

    routes(app: Elysia) {
        return app.group("/lightning-tournaments", (app) =>
            app
                .post("/webhook", async ({ body }) => {
                    const { winnerId: participantId } = body as { winnerId: string };
                    // Assign points (e.g., 10 points for a win)
                    await this.updateRanking.execute({ participantId, points: 10 });
                    return { success: true };
                }, {
                    body: t.Object({
                        winnerId: t.String(), // This is actually participantId from tournaments
                        tournamentId: t.String(),
                        completedAt: t.String(),
                    })
                })
                .get("/ranking", async ({ query }) => {
                    const limit = query.limit ? parseInt(query.limit) : 10;
                    const ranking = await this.getRanking.execute(limit);
                    return ranking.map(r => r.toPrimitives());
                })
                .post("/", async ({ body }) => {
                    const tournament = await this.createTournament.execute(body as CreateTournamentInput);
                    return tournament;
                })
                .post("/link-participant", async ({ body }) => {
                    const { userId, participantId } = body as { userId: string; participantId: string };
                    await this.userRepository.updateParticipantId(userId, participantId);
                    return { success: true };
                }, {
                    body: t.Object({
                        userId: t.String(),
                        participantId: t.String(),
                    })
                })
        );
    }
}
