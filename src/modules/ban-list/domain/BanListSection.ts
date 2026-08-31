export type BanListSectionType = "global" | "group" | "banlist";

export type BanListSection = {
	name: string;
	type: BanListSectionType;
	banLists: string[];
};

export type RankSummary = {
	id: string;
	name: string;
	type: BanListSectionType;
};

export type RankMemberPattern = {
	rankId: string;
	pattern: string;
};
