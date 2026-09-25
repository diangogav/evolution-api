import { ladderFor, TierLadder } from "../domain/TierCatalog";
import { TierGame } from "../domain/TierGame";
import { replayTier, TierStanding } from "../domain/TierReplay";
import { TiersRepository } from "../domain/TiersRepository";
import { TierView } from "./dtos/TierView";

export type PlayerTiersQuery = { userId: string; season: number; rankNames: string[] };

/** The public tier object of a standing under the ladder that produced it. */
export function toTierView(standing: TierStanding, ladder: TierLadder): TierView {
	const tier = ladder.tiers.find((definition) => definition.id === standing.tierId);
	if (tier === undefined) {
		throw new Error(`toTierView: the ladder has no tier "${standing.tierId}"`);
	}

	return {
		id: standing.tierId,
		name: tier.name,
		effectivePoints: standing.effectivePoints,
		gamesPlayed: standing.gamesPlayed,
		progress: standing.progress,
	};
}

/** Live tier derivation: replays the ledger rows of a request, never a stored tier. */
export class TierResolver {
	constructor(private readonly repository: TiersRepository) {}

	/**
	 * The tier of one player in each tiered rank among the given names, keyed
	 * by rank name. Unknown and global names are absent; a tiered rank without
	 * active games replays to Rookie with zero games.
	 */
	async forPlayer({ userId, season, rankNames }: PlayerTiersQuery): Promise<Map<string, TierView>> {
		const tiers = new Map<string, TierView>();
		const ranks = await this.repository.findEligibleRanks(rankNames);
		if (ranks.length === 0) return tiers;

		const games = await this.repository.findTierGames({
			userIds: [userId],
			rankIds: ranks.map((rank) => rank.id),
			season,
		});
		const gamesByRank = groupByRank(games);

		for (const rank of ranks) {
			const ladder = ladderFor(rank.name);
			const standing = replayTier(gamesByRank.get(rank.id) ?? [], ladder);
			tiers.set(rank.name, toTierView(standing, ladder));
		}

		return tiers;
	}
}

function groupByRank(games: TierGame[]): Map<string, TierGame[]> {
	const byRank = new Map<string, TierGame[]>();
	for (const game of games) {
		const rows = byRank.get(game.rankId);
		if (rows) rows.push(game);
		else byRank.set(game.rankId, [game]);
	}
	return byRank;
}
