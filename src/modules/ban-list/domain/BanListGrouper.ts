import { RankMemberPattern, RankMemberPatterns } from "../../../shared/ranks/RankMemberPatterns";
import { BanListSection, RankSummary } from "./BanListSection";

export class BanListGrouper {
	static group(ranks: RankSummary[], patterns: RankMemberPattern[]): BanListSection[] {
		const globals = BanListGrouper.sortByName(ranks.filter((rank) => rank.type === "global"));
		const groups = BanListGrouper.sortByName(ranks.filter((rank) => rank.type === "group"));
		const banLists = BanListGrouper.sortByName(ranks.filter((rank) => rank.type === "banlist"));

		const patternsByRankId = RankMemberPatterns.byRankId(patterns);
		const groupedBanListNames = new Set<string>();

		const groupSections = groups.map((group) => {
			const groupPatterns = patternsByRankId.get(group.id) ?? [];
			const members = banLists.filter((banList) =>
				groupPatterns.some((pattern) => RankMemberPatterns.matches(pattern, banList.name)),
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

	private static sortByName(ranks: RankSummary[]): RankSummary[] {
		return [...ranks].sort((one, other) => one.name.localeCompare(other.name));
	}
}
