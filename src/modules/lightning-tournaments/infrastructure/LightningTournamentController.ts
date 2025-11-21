import { Elysia, t } from "elysia";
import { bearer } from "@elysiajs/bearer";
import { UpdateRankingUseCase } from "../application/UpdateRankingUseCase";
import { GetRankingUseCase } from "../application/GetRankingUseCase";
import { CreateTournamentInput, CreateTournamentProxyUseCase } from "../application/CreateTournamentProxyUseCase";
import { TournamentEnrollmentUseCase } from "../application/TournamentEnrollmentUseCase";
import { JWT } from "src/shared/JWT";
import { UserProfileRole } from "src/evolution-types/src/types/UserProfileRole";
import { UnauthorizedError } from "src/shared/errors/UnauthorizedError";

export class LightningTournamentController {
    constructor(
        private readonly updateRanking: UpdateRankingUseCase,
        private readonly getRanking: GetRankingUseCase,
        private readonly createTournament: CreateTournamentProxyUseCase,
        private readonly tournamentEnrollmentUseCase: TournamentEnrollmentUseCase,
        private readonly jwt: JWT
    ) { }

    routes(app: Elysia) {
        return app.group("/lightning-tournaments", (app) =>
            app
                .use(bearer())
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
                .post("/", async ({ body, bearer }) => {
                    const { role } = this.jwt.decode(bearer as string) as { role: string };
                    if (role !== UserProfileRole.ADMIN) {
                        throw new UnauthorizedError("You do not have permission to create tournaments");
                    }
                    const tournament = await this.createTournament.execute(body as CreateTournamentInput);
                    return tournament;
                })
                .post("/enroll", async ({ body }) => {
                    const { userId, tournamentId } = body as { userId: string; tournamentId: string };
                    await this.tournamentEnrollmentUseCase.execute({ userId, tournamentId });
                    return { success: true };
                }, {
                    body: t.Object({
                        userId: t.String(),
                        tournamentId: t.String(),
                    })
                })
        );
    }
}
