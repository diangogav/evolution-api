import { BanListRepository } from "../domain/BanListRepository";
import { BanListSection } from "../domain/BanListSection";

export class GroupedBanListGetter {
	constructor(private readonly repository: BanListRepository) {}

	async get(season?: number): Promise<BanListSection[]> {
		return this.repository.getGrouped(season);
	}
}
