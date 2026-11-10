import { LightningResultRepository } from "../domain/LightningResultRepository";

export type GetLightningRankingsInput = { season: number; limit: number };

export type LightningRankingView = {
	position: number;
	userId: string;
	username: string;
	points: number;
	tournamentsWon: number;
	tournamentsPlayed: number;
};

export class GetLightningRankings {
	constructor(private readonly results: LightningResultRepository) {}

	async run(input: GetLightningRankingsInput): Promise<LightningRankingView[]> {
		const rankings = await this.results.listRankings(input.season, input.limit);
		return rankings.map((ranking, index) => ({
			position: index + 1,
			userId: ranking.userId,
			username: ranking.username,
			points: ranking.points,
			tournamentsWon: ranking.tournamentsWon,
			tournamentsPlayed: ranking.tournamentsPlayed,
		}));
	}
}
