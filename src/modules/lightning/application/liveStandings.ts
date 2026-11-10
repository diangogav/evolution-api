import { computeStandings, Standing } from "../domain/computeStandings";
import { LightningEntry, qualifiesForStandings } from "../domain/LightningEntry";
import { LightningGame } from "../domain/LightningGame";
import { LightningSystem } from "../domain/LightningTournament";

// Standings while the tournament is not completed: every active player, plus anyone who left
// after playing. Removed players drop out but still count as opponents for Buchholz.
export function liveStandings(
	entries: LightningEntry[],
	resolvedGames: LightningGame[],
	system: LightningSystem,
): Standing[] {
	return computeStandings(
		entries.filter((entry) => qualifiesForStandings(entry, { final: false })),
		resolvedGames,
		{ opponentScores: new Map(entries.map((entry) => [entry.userId, entry.score])), system },
	);
}
