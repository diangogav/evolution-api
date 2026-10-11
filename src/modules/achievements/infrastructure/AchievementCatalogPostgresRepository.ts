import { dataSource } from "../../../evolution-types/src/data-source";
import { AchievementCatalogRepository, CatalogRow } from "../domain/AchievementCatalogRepository";

export class AchievementCatalogPostgresRepository implements AchievementCatalogRepository {
	async findGameplay(): Promise<CatalogRow[]> {
		const rows: Array<{
			id: number;
			code: string;
			icon: string;
			name: string;
			description: string;
			earned_points: number;
			updated_at: Date;
		}> = await dataSource.query(
			`SELECT id, code, icon, name, description, earned_points, updated_at
			 FROM achievements
			 WHERE code IS NOT NULL AND deleted_at IS NULL
			 ORDER BY id`,
		);

		return rows.map((row) => ({
			id: Number(row.id),
			code: row.code,
			icon: row.icon,
			name: row.name,
			description: row.description,
			earnedPoints: Number(row.earned_points),
			updatedAt: new Date(row.updated_at),
		}));
	}
}
