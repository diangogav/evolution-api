import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { CosmeticType } from "../../catalog/domain/CosmeticType";
import { LoadoutItem } from "../domain/Loadout";
import { BotLoadoutRepository } from "../domain/BotLoadoutRepository";

const FIND_BY_BOT_NAME = `SELECT "cosmetic_type", "cosmetic_id" FROM "bot_loadouts" WHERE "bot_name" = $1 ORDER BY "cosmetic_type"`;

export class BotLoadoutPostgresRepository implements BotLoadoutRepository {
	async findByBotName(botName: string): Promise<LoadoutItem[]> {
		const rows: { cosmetic_type: CosmeticType; cosmetic_id: string }[] =
			await cosmeticsDataSource.query(FIND_BY_BOT_NAME, [botName]);

		return rows.map((row) => ({ cosmeticType: row.cosmetic_type, cosmeticId: row.cosmetic_id }));
	}
}
