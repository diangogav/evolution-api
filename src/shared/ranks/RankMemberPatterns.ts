export type RankMemberPattern = {
	rankId: string;
	pattern: string;
};

const SUFFIX_PATTERN_PREFIX = "* ";

export class RankMemberPatterns {
	/**
	 * The name suffix a "* X" pattern requires (" X"), or null when the pattern is
	 * an exact rank name.
	 */
	static suffixOf(pattern: string): string | null {
		if (!pattern.startsWith(SUFFIX_PATTERN_PREFIX)) {
			return null;
		}

		return ` ${pattern.slice(SUFFIX_PATTERN_PREFIX.length)}`;
	}

	/**
	 * A "* X" pattern matches every rank name ending with " X".
	 * Any other pattern is an exact rank name match.
	 */
	static matches(pattern: string, rankName: string): boolean {
		const suffix = RankMemberPatterns.suffixOf(pattern);

		if (suffix !== null) {
			return rankName.endsWith(suffix);
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
