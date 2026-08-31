import { BanListSection } from "./BanListSection";

export interface BanListRepository {
	get(season?: number): Promise<string[]>;
	getGrouped(season?: number): Promise<BanListSection[]>;
}
