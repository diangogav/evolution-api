import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { ShopCatalogRepository, ShopCosmetic } from "../domain/ShopCatalogRepository";

const COLUMNS = `id, type, tier, display_name AS "displayName", essence_price AS "essencePrice",
	asset_ref AS "assetRef", asset_files AS "assetFiles"`;

const FIND_PURCHASABLE_QUERY = `SELECT ${COLUMNS} FROM cosmetics
	WHERE active = true AND essence_price IS NOT NULL ORDER BY type ASC, display_name ASC`;

const FIND_BY_ID_QUERY = `SELECT ${COLUMNS} FROM cosmetics
	WHERE id = $1 AND active = true AND essence_price IS NOT NULL`;

export class ShopCatalogPostgresRepository implements ShopCatalogRepository {
	async findPurchasable(): Promise<ShopCosmetic[]> {
		return (await cosmeticsDataSource.query(FIND_PURCHASABLE_QUERY)) as ShopCosmetic[];
	}

	async findPurchasableById(cosmeticId: string): Promise<ShopCosmetic | null> {
		const rows = (await cosmeticsDataSource.query(FIND_BY_ID_QUERY, [
			cosmeticId,
		])) as ShopCosmetic[];
		return rows[0] ?? null;
	}
}
