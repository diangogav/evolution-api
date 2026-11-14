import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { CosmeticType } from "../../catalog";
import { LoadoutItem } from "../domain/Loadout";
import { BotLoadoutListing, BotLoadoutRepository } from "../domain/BotLoadoutRepository";

const FIND_BY_BOT_NAME = `SELECT "cosmetic_type", "cosmetic_id" FROM "bot_loadouts" WHERE "bot_name" = $1 ORDER BY "cosmetic_type"`;

const LIST = `SELECT "bot_name", "cosmetic_id" FROM "bot_loadouts" ORDER BY "bot_name"`;

export class BotLoadoutPostgresRepository implements BotLoadoutRepository, BotLoadoutListing {
	async findByBotName(botName: string): Promise<LoadoutItem[]> {
		const rows: { cosmetic_type: CosmeticType; cosmetic_id: string }[] =
			await cosmeticsDataSource.query(FIND_BY_BOT_NAME, [botName]);

		return rows.map((row) => ({ cosmeticType: row.cosmetic_type, cosmeticId: row.cosmetic_id }));
	}

	async list(): Promise<{ botName: string; cosmeticId: string }[]> {
		const rows: { bot_name: string; cosmetic_id: string }[] = await cosmeticsDataSource.query(LIST);

		return rows.map((row) => ({ botName: row.bot_name, cosmeticId: row.cosmetic_id }));
	}
}
