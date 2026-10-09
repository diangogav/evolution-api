import { RankMemberPatterns } from "../../../shared/ranks/RankMemberPatterns";

export const LADDERS = ["TCG", "OCG", "Edison", "JTP", "Genesys"] as const;

export type Ladder = (typeof LADDERS)[number];

/** An enabled group rank and the ban list patterns it aggregates. */
export type LadderGroup = { name: string; patterns: string[] };

/**
 * Which ladders the player has won in. A played ban list feeds its own rank
 * (JTP and Genesys are ban lists) and every group whose patterns match it
 * (a dated "2026.09 TCG" list feeds the TCG group).
 */
export function ladderWins(
	winningBanListNames: string[],
	groups: LadderGroup[],
): Record<Ladder, boolean> {
	const reached = new Set<string>();

	for (const banListName of winningBanListNames) {
		reached.add(banListName);

		for (const group of groups) {
			if (group.patterns.some((pattern) => RankMemberPatterns.matches(pattern, banListName))) {
				reached.add(group.name);
			}
		}
	}

	return Object.fromEntries(LADDERS.map((ladder) => [ladder, reached.has(ladder)])) as Record<
		Ladder,
		boolean
	>;
}
