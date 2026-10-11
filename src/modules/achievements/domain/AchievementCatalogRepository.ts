export type CatalogRow = {
	id: number;
	code: string;
	icon: string;
	name: string;
	description: string;
	earnedPoints: number;
	updatedAt: Date;
};

export interface AchievementCatalogRepository {
	/** Gameplay achievements (those with a code), ordered by id. */
	findGameplay(): Promise<CatalogRow[]>;
}
