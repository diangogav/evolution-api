import { AchievementCatalogRepository } from "../domain/AchievementCatalogRepository";
import { AchievementRequirement, requirementFromCode } from "../domain/AchievementRequirement";
import { catalogVersion } from "../domain/catalogVersion";

export type AchievementCatalog = {
	version: string;
	items: Array<{
		id: number;
		code: string;
		icon: string;
		name: string;
		description: string;
		earnedPoints: number;
		requirement: AchievementRequirement | null;
	}>;
};

export class GetAchievementCatalog {
	constructor(private readonly repository: AchievementCatalogRepository) {}

	async run(): Promise<AchievementCatalog> {
		const rows = await this.repository.findGameplay();

		return {
			version: catalogVersion(rows),
			items: rows.map((row) => ({
				id: row.id,
				code: row.code,
				icon: row.icon,
				name: row.name,
				description: row.description,
				earnedPoints: row.earnedPoints,
				requirement: requirementFromCode(row.code),
			})),
		};
	}
}
