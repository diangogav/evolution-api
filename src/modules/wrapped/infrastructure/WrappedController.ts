import { GetSeasonWrappedData } from "../application/GetSeasonWrappedData";
import { WrappedPostgresRepository } from "./WrappedPostgresRepository";

// Domain errors
export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

export class WrappedController {
    async getData(context: { params: { seasonId: string; playerId: string } }) {
        const seasonId = parseInt(context.params.seasonId, 10);
        const { playerId } = context.params;

        // Validation
        if (isNaN(seasonId) || seasonId < 1) {
            throw new ValidationError("Season ID must be a valid positive integer");
        }

        if (!playerId || !/^[a-f0-9-]{36}$/i.test(playerId)) {
            throw new ValidationError("Player ID must be a valid UUID");
        }

        const repository = new WrappedPostgresRepository();
        const useCase = new GetSeasonWrappedData(repository);

        const result = await useCase.execute(seasonId, playerId);

        // Check if data exists
        if (!result || result.globalStats.totalMatches === 0) {
            throw new NotFoundError(`No wrapped data found for player ${playerId} in season ${seasonId}`);
        }

        return JSON.parse(JSON.stringify(result));
    }
}
