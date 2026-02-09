import type { SeasonWrapped } from "../domain/SeasonWrapped";
import type { WrappedRepository } from "../domain/WrappedRepository";

import { config } from "../../../config";

export class GetSeasonWrappedData {
    constructor(private readonly repository: WrappedRepository) { }

    async execute(seasonId: number, playerId: string): Promise<SeasonWrapped> {
        // Prevent accessing wrapped data for the current/active season
        if (seasonId >= config.season) {
            throw new Error(`Season ${seasonId} Wrapped is not available yet.`);
        }

        const data = await this.repository.getSeasonWrappedData(seasonId, playerId);

        if (!data) {
            throw new Error(`No data found for player ${playerId} in season ${seasonId}`);
        }

        return data;
    }
}
