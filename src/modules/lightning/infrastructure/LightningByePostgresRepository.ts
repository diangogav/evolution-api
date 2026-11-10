import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { runQuery } from "../../../shared/persistence/runQuery";
import { LightningBye, LightningByeRepository } from "../domain/LightningByeRepository";

// No ON CONFLICT: the bye also scores the entry, so a second bye for the same round must fail
// the pairing pass instead of passing silently.
const INSERT_QUERY = `INSERT INTO lightning_byes (tournament_id, user_id, round) VALUES ($1, $2, $3)`;

const LIST_QUERY = `SELECT tournament_id, user_id, round FROM lightning_byes
	WHERE tournament_id = $1 ORDER BY round, user_id`;

type Row = { tournament_id: string; user_id: string; round: number | string };

export class LightningByePostgresRepository implements LightningByeRepository {
	async insert(bye: LightningBye, manager: QueryableManager): Promise<void> {
		await runQuery(INSERT_QUERY, [bye.tournamentId, bye.userId, bye.round], manager);
	}

	async listByTournament(
		tournamentId: string,
		manager?: QueryableManager,
	): Promise<LightningBye[]> {
		const rows = await runQuery<Row>(LIST_QUERY, [tournamentId], manager);
		return rows.map((row) => ({
			tournamentId: row.tournament_id,
			userId: row.user_id,
			round: Number(row.round),
		}));
	}
}
