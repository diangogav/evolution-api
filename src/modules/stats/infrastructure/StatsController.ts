import { GetGlobalStats } from "../application/GetGlobalStats";
import { GlobalStatsPostgresRepository } from "./GlobalStatsPostgresRepository";
import { config } from "../../../config";

export class StatsController {
    async getGlobalStats(context: { query: { season?: string } }) {
        const season = context.query.season ? parseInt(context.query.season) : config.season;

        const repository = new GlobalStatsPostgresRepository();
        const useCase = new GetGlobalStats(repository);

        return await useCase.execute(season);
    }
}
