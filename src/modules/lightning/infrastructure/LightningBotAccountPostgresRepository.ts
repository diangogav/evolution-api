import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { LightningBotAccount, LightningBotAccountRepository } from "../domain/LightningBotAccount";
import { LightningFormat } from "../domain/LightningTournament";

const LIST_BY_FORMAT_QUERY = `SELECT user_id, format, bot_name FROM lightning_bot_accounts
	WHERE format = $1 ORDER BY sort_order, user_id`;

type Row = { user_id: string; format: string; bot_name: string };

export class LightningBotAccountPostgresRepository implements LightningBotAccountRepository {
	async listByFormat(
		format: LightningFormat,
		manager?: QueryableManager,
	): Promise<LightningBotAccount[]> {
		const rows = await runQuery<Row>(LIST_BY_FORMAT_QUERY, [format], manager);
		return rows.map((row) => ({ userId: row.user_id, format: row.format, botName: row.bot_name }));
	}
}
