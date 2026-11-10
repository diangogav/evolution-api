import { LightningEntry } from "./LightningEntry";
import { LightningGame } from "./LightningGame";
import { LightningSystem } from "./LightningTournament";

export type StandingEntry = Pick<
	LightningEntry,
	"userId" | "status" | "registeredAt" | "score" | "wins" | "draws" | "losses" | "gamesPlayed"
>;

export type AppliedGame = Pick<LightningGame, "seat0UserId" | "seat1UserId" | "resolution">;

export type Standing = {
	position: number;
	userId: string;
	score: number;
	wins: number;
	draws: number;
	losses: number;
	gamesPlayed: number;
	/** Buchholz: the sum of the scores of every opponent actually played. */
	tiebreak: number;
};

const PLAYED = new Set(["seat0_win", "seat1_win", "draw"]);

/**
 * Ranks the given entries by score, wins, Buchholz and registration time; Swiss puts Buchholz
 * ahead of wins, because every player plays the same rounds and strength of schedule is the
 * meaningful tiebreak. Opponents who are not among the ranked entries (removed, or filtered
 * out by the caller) still count for Buchholz through `opponentScores`.
 */
export function computeStandings(
	entries: StandingEntry[],
	games: AppliedGame[],
	options: { opponentScores?: ReadonlyMap<string, number>; system?: LightningSystem } = {},
): Standing[] {
	const swiss = options.system === "swiss";
	const scores = new Map(options.opponentScores ?? []);
	for (const entry of entries) scores.set(entry.userId, entry.score);

	const buchholz = new Map<string, number>();
	for (const game of games) {
		if (!game.resolution || !PLAYED.has(game.resolution)) continue;
		add(buchholz, game.seat0UserId, scores.get(game.seat1UserId) ?? 0);
		add(buchholz, game.seat1UserId, scores.get(game.seat0UserId) ?? 0);
	}

	return entries
		.map((entry) => ({ entry, tiebreak: buchholz.get(entry.userId) ?? 0 }))
		.sort(
			(a, b) =>
				b.entry.score - a.entry.score ||
				(swiss ? b.tiebreak - a.tiebreak : b.entry.wins - a.entry.wins) ||
				(swiss ? b.entry.wins - a.entry.wins : b.tiebreak - a.tiebreak) ||
				a.entry.registeredAt.getTime() - b.entry.registeredAt.getTime() ||
				a.entry.userId.localeCompare(b.entry.userId),
		)
		.map(({ entry, tiebreak }, index) => ({
			position: index + 1,
			userId: entry.userId,
			score: entry.score,
			wins: entry.wins,
			draws: entry.draws,
			losses: entry.losses,
			gamesPlayed: entry.gamesPlayed,
			tiebreak,
		}));
}

function add(totals: Map<string, number>, userId: string, amount: number): void {
	totals.set(userId, (totals.get(userId) ?? 0) + amount);
}
