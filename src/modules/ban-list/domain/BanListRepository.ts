export interface BanListRepository {
	get(season?: number): Promise<string[]>;
}
