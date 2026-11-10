import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { LightningChatMessage, NewLightningChatMessage } from "../domain/LightningChatMessage";
import { LightningChatMessageRepository } from "../domain/LightningChatMessageRepository";
import { returnedRows, toDate } from "./returnedRows";

const COLUMNS = "id, tournament_id, user_id, body, created_at, deleted_at, deleted_by";

const INSERT_QUERY = `INSERT INTO lightning_chat_messages (tournament_id, user_id, body)
	VALUES ($1, $2, $3) RETURNING ${COLUMNS}`;

// The inner query walks the (tournament_id, id) index backwards from the cursor; the outer
// one hands the page back oldest first.
const PAGE_BEFORE_QUERY = `SELECT ${COLUMNS} FROM (
	SELECT ${COLUMNS} FROM lightning_chat_messages
	WHERE tournament_id = $1 AND ($2::bigint IS NULL OR id < $2::bigint)
	ORDER BY id DESC LIMIT $3
) page ORDER BY id`;

const LIST_AFTER_QUERY = `SELECT ${COLUMNS} FROM lightning_chat_messages
	WHERE tournament_id = $1 AND id > $2 AND deleted_at IS NULL ORDER BY id LIMIT $3`;

const FIND_BY_ID_QUERY = `SELECT ${COLUMNS} FROM lightning_chat_messages WHERE id = $1`;

// Only the first delete stamps the row, so a repeated delete keeps the original admin and time.
const SOFT_DELETE_QUERY = `UPDATE lightning_chat_messages SET deleted_at = now(), deleted_by = $2
	WHERE id = $1 AND deleted_at IS NULL RETURNING id`;

type Row = {
	// pg returns bigint columns as strings.
	id: string | number;
	tournament_id: string;
	user_id: string;
	body: string;
	created_at: Date | string;
	deleted_at: Date | string | null;
	deleted_by: string | null;
};

function toMessage(row: Row): LightningChatMessage {
	return {
		id: Number(row.id),
		tournamentId: row.tournament_id,
		userId: row.user_id,
		body: row.body,
		createdAt: new Date(row.created_at),
		deletedAt: toDate(row.deleted_at),
		deletedBy: row.deleted_by,
	};
}

export class LightningChatMessagePostgresRepository implements LightningChatMessageRepository {
	async insert(
		message: NewLightningChatMessage,
		manager?: QueryableManager,
	): Promise<LightningChatMessage> {
		const rows = await runQuery<Row>(
			INSERT_QUERY,
			[message.tournamentId, message.userId, message.body],
			manager,
		);
		return toMessage(rows[0]);
	}

	async pageBefore(
		tournamentId: string,
		beforeId: number | null,
		limit: number,
		manager?: QueryableManager,
	): Promise<LightningChatMessage[]> {
		const rows = await runQuery<Row>(PAGE_BEFORE_QUERY, [tournamentId, beforeId, limit], manager);
		return rows.map(toMessage);
	}

	async listAfter(
		tournamentId: string,
		afterId: number,
		cap: number,
		manager?: QueryableManager,
	): Promise<LightningChatMessage[]> {
		const rows = await runQuery<Row>(LIST_AFTER_QUERY, [tournamentId, afterId, cap], manager);
		return rows.map(toMessage);
	}

	async findById(id: number, manager?: QueryableManager): Promise<LightningChatMessage | null> {
		const rows = await runQuery<Row>(FIND_BY_ID_QUERY, [id], manager);
		return rows[0] ? toMessage(rows[0]) : null;
	}

	async softDelete(id: number, adminUserId: string, manager?: QueryableManager): Promise<boolean> {
		const result = await runQuery<unknown>(SOFT_DELETE_QUERY, [id, adminUserId], manager);
		return returnedRows<{ id: string }>(result).length > 0;
	}
}
