import { BanListRepository } from "../domain/BanListRepository";

export class BanListGetter {
	constructor(private readonly repository: BanListRepository) {}

	async get(season?: number): Promise<string[]> {
		return this.repository.get(season);
	}
}
