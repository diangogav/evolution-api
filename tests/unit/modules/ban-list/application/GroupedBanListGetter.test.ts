import { describe, expect, it, mock } from "bun:test";

import { GroupedBanListGetter } from "../../../../../src/modules/ban-list/application/GroupedBanListGetter";
import { BanListRepository } from "../../../../../src/modules/ban-list/domain/BanListRepository";
import { BanListSection } from "../../../../../src/modules/ban-list/domain/BanListSection";

function repositoryReturning(sections: BanListSection[]): BanListRepository {
	return {
		get: mock(async () => []),
		getGrouped: mock(async () => sections),
	};
}

describe("GroupedBanListGetter", () => {
	it("returns the sections the repository resolves for the requested season", async () => {
		const sections: BanListSection[] = [
			{ name: "Global", type: "global", banLists: [] },
			{ name: "Edison", type: "group", banLists: ["March 2010 Edison"] },
		];
		const repository = repositoryReturning(sections);

		const result = await new GroupedBanListGetter(repository).get(5);

		expect(result).toEqual(sections);
		expect(repository.getGrouped).toHaveBeenCalledWith(5);
	});

	it("delegates without a season so the repository falls back to the configured one", async () => {
		const repository = repositoryReturning([]);

		await new GroupedBanListGetter(repository).get();

		expect(repository.getGrouped).toHaveBeenCalledWith(undefined);
	});
});
