import { isMasterEligible, MasterCandidate, selectMaster } from "../domain/MasterSelection";
import { ladderFor, TierDefinition, TierLadder } from "../domain/TierCatalog";
import { TierGame } from "../domain/TierGame";
import { replayTier, TierStanding } from "../domain/TierReplay";
import { MasterRating, TierRank, TiersRepository } from "../domain/TiersRepository";
import { TierView } from "./dtos/TierView";

export type PlayerTiersQuery = { userId: string; season: number; rankNames: string[] };

export type LeaderboardPageQuery = { rankName: string; season: number; userIds: string[] };

/** Master candidates read from player_stats per round trip. */
export const MASTER_CANDIDATE_BATCH = 50;

/** The standings replayed so far in one request, per user, so a player is never replayed twice. */
type Replays = Map<string, TierStanding>;

/** The players holding Master in a rank, each with the Elo they expose or null when player_ratings has no row. */
type MasterSeats = Map<string, MasterRating | null>;

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

/** The public tier object of a player seated at Master: the relative tier, no progress, and the Elo when known. */
export function toMasterView(
	standing: TierStanding,
	ladder: TierLadder,
	rating: MasterRating | null,
): TierView {
	const master = masterTier(ladder);
	if (master === undefined) {
		throw new Error("toMasterView: the ladder has no relative tier");
	}

	return {
		id: master.id,
		name: master.name,
		effectivePoints: standing.effectivePoints,
		gamesPlayed: standing.gamesPlayed,
		progress: null,
		...(rating === null ? {} : { rating: rating.rating, peak: rating.peak }),
	};
}

/** Live tier derivation: replays the ledger rows of a request, never a stored tier. */
export class TierResolver {
	constructor(private readonly repository: TiersRepository) {}

	/**
	 * The tier of one player in each tiered rank among the given names, keyed
	 * by rank name. Unknown and global names are absent; a tiered rank without
	 * active games replays to Rookie with zero games. Master is resolved only
	 * for the ranks where the player is eligible for it.
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
		const gamesByRank = groupBy(games, (game) => game.rankId);

		for (const rank of ranks) {
			const ladder = ladderFor(rank.name);
			const standing = replayTier(gamesByRank.get(rank.id) ?? [], ladder);
			const seats = await this.masterSeats(rank, season, ladder, new Map([[userId, standing]]));
			tiers.set(rank.name, view(userId, standing, ladder, seats));
		}

		return tiers;
	}

	/**
	 * The tier of every user on one leaderboard page of a rank, keyed by user
	 * id. An untiered rank yields an empty map. Only the page's users are
	 * replayed, and Master is resolved only when one of them is eligible.
	 */
	async forLeaderboardPage({
		rankName,
		season,
		userIds,
	}: LeaderboardPageQuery): Promise<Map<string, TierView>> {
		const tiers = new Map<string, TierView>();
		if (userIds.length === 0) return tiers;

		const [rank] = await this.repository.findEligibleRanks([rankName]);
		if (rank === undefined) return tiers;

		const ladder = ladderFor(rank.name);
		const replays = await this.replay(userIds, rank, season, ladder);
		const seats = await this.masterSeats(rank, season, ladder, replays);

		for (const userId of userIds) {
			tiers.set(userId, view(userId, standingOf(replays, userId), ladder, seats));
		}

		return tiers;
	}

	/** One row query for the given users in one rank; a user without rows replays to Rookie. */
	private async replay(
		userIds: string[],
		rank: TierRank,
		season: number,
		ladder: TierLadder,
	): Promise<Replays> {
		if (userIds.length === 0) return new Map();

		const games = await this.repository.findTierGames({ userIds, rankIds: [rank.id], season });
		const gamesByUser = groupBy(games, (game) => game.userId);

		return new Map(
			userIds.map((userId) => [userId, replayTier(gamesByUser.get(userId) ?? [], ladder)]),
		);
	}

	/**
	 * The Master seats of a rank, resolved only when one of the given replays
	 * is eligible: otherwise none of them can hold a seat and the seats do not
	 * matter to this request. Candidates come from player_stats in the
	 * leaderboard total order, one batch at a time, reusing every replay the
	 * request already has, until enough eligible players are confirmed or the
	 * candidates run out. The Elo is read for the seated players only.
	 */
	private async masterSeats(
		rank: TierRank,
		season: number,
		ladder: TierLadder,
		replays: Replays,
	): Promise<MasterSeats> {
		const seats: MasterSeats = new Map();
		const master = masterTier(ladder);
		if (master === undefined) return seats;
		if (![...replays.values()].some((standing) => isMasterEligible(standing, ladder))) return seats;

		const size = master.size ?? 0;
		const ordered: MasterCandidate[] = [];
		let eligible = 0;

		for (let offset = 0; eligible < size; offset += MASTER_CANDIDATE_BATCH) {
			const batch = await this.repository.findMasterCandidates({
				rankId: rank.id,
				season,
				minGames: master.minGames ?? 0,
				limit: MASTER_CANDIDATE_BATCH,
				offset,
			});
			const unseen = batch.filter((userId) => !replays.has(userId));
			for (const [userId, standing] of await this.replay(unseen, rank, season, ladder)) {
				replays.set(userId, standing);
			}
			for (const userId of batch) {
				const standing = standingOf(replays, userId);
				ordered.push({ userId, standing });
				if (isMasterEligible(standing, ladder)) eligible++;
			}
			if (batch.length < MASTER_CANDIDATE_BATCH) break;
		}

		const seated = selectMaster(ordered, ladder);
		if (seated.length === 0) return seats;

		const ratings = await this.repository.findMasterRatings({
			rankId: rank.id,
			season,
			userIds: seated,
		});
		const ratingByUser = new Map(ratings.map((rating) => [rating.userId, rating]));
		for (const userId of seated) seats.set(userId, ratingByUser.get(userId) ?? null);

		return seats;
	}
}

function masterTier(ladder: TierLadder): TierDefinition | undefined {
	return ladder.tiers.find((tier) => tier.kind === "relative");
}

function view(
	userId: string,
	standing: TierStanding,
	ladder: TierLadder,
	seats: MasterSeats,
): TierView {
	const rating = seats.get(userId);

	return rating === undefined
		? toTierView(standing, ladder)
		: toMasterView(standing, ladder, rating);
}

function standingOf(replays: Replays, userId: string): TierStanding {
	const standing = replays.get(userId);
	if (standing === undefined) {
		throw new Error(`TierResolver: user "${userId}" was never replayed in this request`);
	}

	return standing;
}

function groupBy(games: TierGame[], key: (game: TierGame) => string): Map<string, TierGame[]> {
	const groups = new Map<string, TierGame[]>();
	for (const game of games) {
		const rows = groups.get(key(game));
		if (rows) rows.push(game);
		else groups.set(key(game), [game]);
	}
	return groups;
}
