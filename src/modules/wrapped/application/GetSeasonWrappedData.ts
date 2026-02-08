import type { SeasonWrapped } from "../domain/SeasonWrapped";
import type { WrappedRepository } from "../domain/WrappedRepository";

export class GetSeasonWrappedData {
    constructor(private readonly repository: WrappedRepository) { }

    async execute(seasonId: number, playerId: string): Promise<SeasonWrapped> {
        const data = await this.repository.getSeasonWrappedData(seasonId, playerId);

        if (!data) {
            throw new Error(`No data found for player ${playerId} in season ${seasonId}`);
        }

        return data;
    }
}
