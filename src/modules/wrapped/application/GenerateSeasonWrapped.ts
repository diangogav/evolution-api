import type { WrappedRepository } from "../domain/WrappedRepository";
import type { PdfGenerator } from "../infrastructure/PdfGenerator";
import { config } from "../../../config";

export interface GenerateOptions {
    locale?: string;
    theme?: "dark" | "light";
    includeMatchList?: boolean;
    singlePage?: boolean;
}

export class GenerateSeasonWrapped {
    constructor(
        private readonly repository: WrappedRepository,
        private readonly pdfGenerator: PdfGenerator,
    ) { }

    async execute(
        seasonId: number,
        playerId: string,
        options: GenerateOptions = {},
    ): Promise<{ pdf: Buffer; playerName: string }> {
        // Prevent generating wrapped for the current/active season
        if (seasonId >= config.season) {
            throw new Error(`Season ${seasonId} Wrapped is not available yet.`);
        }
        const data = await this.repository.getSeasonWrappedData(seasonId, playerId);

        if (!data) {
            throw new Error(`No data found for player ${playerId} in season ${seasonId}`);
        }

        const pdf = await this.pdfGenerator.generate(data, {
            locale: options.locale ?? "es",
            theme: options.theme ?? "dark",
            includeMatchList: options.includeMatchList ?? false,
            singlePage: options.singlePage ?? false,
        });

        return { pdf, playerName: data.playerName };
    }
}
