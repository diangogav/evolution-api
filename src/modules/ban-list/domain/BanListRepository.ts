export interface BanListRepository {
	get(): Promise<string[]>;
}
