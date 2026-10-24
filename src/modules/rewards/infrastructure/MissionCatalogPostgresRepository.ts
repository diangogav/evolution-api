import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { Mission } from "../domain/Mission";
import { MissionCatalogRepository } from "../domain/MissionCatalogRepository";

const FIND_ACTIVE_QUERY = `SELECT id, code, name, description, period, rule, reward, active,
	sort_order AS "sortOrder" FROM mission_catalog WHERE active = true ORDER BY sort_order ASC, code ASC`;

export class MissionCatalogPostgresRepository implements MissionCatalogRepository {
	async findActive(): Promise<Mission[]> {
		const rows = (await cosmeticsDataSource.query(FIND_ACTIVE_QUERY)) as Mission[];
		return rows.map((row) => ({
			id: row.id,
			code: row.code,
			name: row.name,
			description: row.description,
			period: row.period,
			rule: row.rule,
			reward: row.reward,
			active: row.active,
			sortOrder: row.sortOrder,
		}));
	}
}
