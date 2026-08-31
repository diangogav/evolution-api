export type RankMemberPattern = {
	rankId: string;
	pattern: string;
};

const SUFFIX_PATTERN_PREFIX = "* ";

export class RankMemberPatterns {
	/**
	 * A "* X" pattern matches every rank name ending with " X".
	 * Any other pattern is an exact rank name match.
	 */
	static matches(pattern: string, rankName: string): boolean {
		if (pattern.startsWith(SUFFIX_PATTERN_PREFIX)) {
			return rankName.endsWith(` ${pattern.slice(SUFFIX_PATTERN_PREFIX.length)}`);
		}

		return pattern === rankName;
	}

	static byRankId(patterns: RankMemberPattern[]): Map<string, string[]> {
		const grouped = new Map<string, string[]>();

		for (const { rankId, pattern } of patterns) {
			const current = grouped.get(rankId);

			if (current) {
				current.push(pattern);
				continue;
			}

			grouped.set(rankId, [pattern]);
		}

		return grouped;
	}
}
