import type { SeasonWrapped } from "./SeasonWrapped";

export interface WrappedRepository {
    getSeasonWrappedData(seasonId: number, playerId: string): Promise<SeasonWrapped | null>;
}
