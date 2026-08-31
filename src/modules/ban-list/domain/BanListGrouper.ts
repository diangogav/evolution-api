import { BanListSection, RankMemberPattern, RankSummary } from "./BanListSection";

const SUFFIX_PATTERN_PREFIX = "* ";

export class BanListGrouper {
	static group(ranks: RankSummary[], patterns: RankMemberPattern[]): BanListSection[] {
		const globals = BanListGrouper.sortByName(ranks.filter((rank) => rank.type === "global"));
		const groups = BanListGrouper.sortByName(ranks.filter((rank) => rank.type === "group"));
		const banLists = BanListGrouper.sortByName(ranks.filter((rank) => rank.type === "banlist"));

		const patternsByRankId = BanListGrouper.patternsByRankId(patterns);
		const groupedBanListNames = new Set<string>();

		const groupSections = groups.map((group) => {
			const groupPatterns = patternsByRankId.get(group.id) ?? [];
			const members = banLists.filter((banList) =>
				groupPatterns.some((pattern) => BanListGrouper.matches(pattern, banList.name)),
			);

			for (const member of members) {
				groupedBanListNames.add(member.name);
			}

			return { name: group.name, type: group.type, banLists: members.map((member) => member.name) };
		});

		const ungroupedSections = banLists
			.filter((banList) => !groupedBanListNames.has(banList.name))
			.map((banList) => ({ name: banList.name, type: banList.type, banLists: [] }));

		const globalSections = globals.map((global) => ({
			name: global.name,
			type: global.type,
			banLists: [],
		}));

		return [...globalSections, ...groupSections, ...ungroupedSections];
	}

	/**
	 * A "* X" pattern matches every rank name ending with " X".
	 * Any other pattern is an exact rank name match.
	 */
	private static matches(pattern: string, rankName: string): boolean {
		if (pattern.startsWith(SUFFIX_PATTERN_PREFIX)) {
			return rankName.endsWith(` ${pattern.slice(SUFFIX_PATTERN_PREFIX.length)}`);
		}

		return pattern === rankName;
	}

	private static patternsByRankId(patterns: RankMemberPattern[]): Map<string, string[]> {
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

	private static sortByName(ranks: RankSummary[]): RankSummary[] {
		return [...ranks].sort((one, other) => one.name.localeCompare(other.name));
	}
}
