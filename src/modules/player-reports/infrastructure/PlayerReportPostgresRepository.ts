import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import {
	REPORT_DAILY_LIMIT,
	REPORT_WINDOW_DAYS,
	type MatchEvidence,
	type PlayerReport,
	type PlayerReportRepository,
	type ReportDetail,
	type ReportReceipt,
	type ReportReview,
	type ReportStatus,
	type ReportableMatch,
	type ReviewReportInput,
	type SubmitReportInput,
} from "../domain/PlayerReport";

export interface ReportDatabase extends QueryableManager {
	transaction<T>(work: (manager: QueryableManager) => Promise<T>): Promise<T>;
}
const columns = `id, reporter_id AS "reporterId", reported_user_id AS "reportedUserId", game_id AS "gameId",
 reason, details, context, status, revision, created_at AS "createdAt", updated_at AS "updatedAt"`;
type StoredReport = Omit<PlayerReport, "createdAt" | "updatedAt"> & {
	createdAt: Date;
	updatedAt: Date;
};
const reportView = (row: StoredReport): PlayerReport => ({
	...row,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
});
const receipt = (row: StoredReport): ReportReceipt => ({
	id: row.id,
	status: row.status,
	createdAt: row.createdAt.toISOString(),
});
const cutoff = (now: Date) => new Date(now.getTime() - REPORT_WINDOW_DAYS * 86400000);
const ids = (value: string | null) => (value ?? "").split(",").filter(Boolean);
const eligibility = `m.user_id=$1 AND m.deleted_at IS NULL AND m.date >= $2 AND m.date <= $3
 AND $1=ANY(string_to_array(m.player_ids, ','))`;
const opponentJoin = `JOIN LATERAL (
 SELECT jsonb_agg(jsonb_build_object('userId',u.id,'username',u.username) ORDER BY u.id) AS opponents
 FROM users u WHERE u.id=ANY(string_to_array(m.opponent_ids, ',')) AND u.id<>$1 AND u.deleted_at IS NULL
) o ON o.opponents IS NOT NULL`;

export class PlayerReportPostgresRepository implements PlayerReportRepository {
	constructor(private readonly db: ReportDatabase = cosmeticsDataSource) {}
	async listMatches(input: {
		reporterId: string;
		page: number;
		limit: number;
		now: Date;
	}): Promise<ReportableMatch[]> {
		const rows = (await this.db.query(
			`SELECT m.game_id AS "gameId", m.date, m.ban_list_name AS "banListName",
   m.player_score AS "playerScore", m.opponent_score AS "opponentScore", o.opponents
   FROM matches m ${opponentJoin} WHERE ${eligibility}
   ORDER BY m.date DESC,m.id DESC LIMIT $4 OFFSET $5`,
			[input.reporterId, cutoff(input.now), input.now, input.limit, (input.page - 1) * input.limit],
		)) as (Omit<ReportableMatch, "date"> & { date: Date })[];
		return rows.map((row) => ({ ...row, date: row.date.toISOString() }));
	}
	async submit(input: SubmitReportInput): ReturnType<PlayerReportRepository["submit"]> {
		return this.db.transaction(async (tx) => {
			// One lock per authenticated reporter covers both the rolling quota and the
			// duplicate lookup. Multiple API processes cannot race five reports into six.
			await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
				"player-report:" + input.reporterId,
			]);
			const existing = (await tx.query(
				`SELECT ${columns} FROM player_reports
    WHERE reporter_id=$1 AND game_id=$2 AND reported_user_id=$3`,
				[input.reporterId, input.gameId, input.reportedUserId],
			)) as StoredReport[];
			if (existing[0]) return { outcome: "accepted", receipt: receipt(existing[0]) };
			type MatchRow = {
				id: string;
				game_id: string;
				date: Date;
				ban_list_name: string;
				best_of: number;
				player_score: number;
				opponent_score: number;
				player_ids: string;
				opponent_ids: string;
				player_names: string;
				opponent_names: string;
				reporter_username: string;
				reported_username: string;
			};
			const matches = (await tx.query(
				`SELECT m.*, reporter.username AS reporter_username, target.username AS reported_username
    FROM matches m JOIN users reporter ON reporter.id=$1 AND reporter.deleted_at IS NULL
    JOIN users target ON target.id=$5 AND target.deleted_at IS NULL
    WHERE ${eligibility} AND m.game_id=$4 AND $5=ANY(string_to_array(m.opponent_ids, ',')) AND $1<>$5
    ORDER BY m.date DESC,m.id DESC LIMIT 1`,
				[input.reporterId, cutoff(input.now), input.now, input.gameId, input.reportedUserId],
			)) as MatchRow[];
			const match = matches[0];
			if (!match) return { outcome: "ineligible" };
			const counts = (await tx.query(
				"SELECT COUNT(*)::int AS count FROM player_reports WHERE reporter_id=$1 AND created_at>$2",
				[input.reporterId, new Date(input.now.getTime() - 86400000)],
			)) as { count: number }[];
			if (counts[0].count >= REPORT_DAILY_LIMIT) return { outcome: "quota" };
			const context: MatchEvidence = {
				matchId: match.id,
				gameId: match.game_id,
				date: match.date.toISOString(),
				banListName: match.ban_list_name,
				bestOf: match.best_of,
				playerScore: match.player_score,
				opponentScore: match.opponent_score,
				playerIds: ids(match.player_ids),
				opponentIds: ids(match.opponent_ids),
				playerNames: ids(match.player_names),
				opponentNames: ids(match.opponent_names),
				reporterUsername: match.reporter_username,
				reportedUsername: match.reported_username,
			};
			const created = (await tx.query(
				`INSERT INTO player_reports
    (reporter_id,reported_user_id,game_id,reason,details,context,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING ${columns}`,
				[
					input.reporterId,
					input.reportedUserId,
					input.gameId,
					input.reason,
					input.details,
					JSON.stringify(context),
					input.now,
				],
			)) as StoredReport[];
			return { outcome: "accepted", receipt: receipt(created[0]) };
		});
	}
	async list(input: {
		page: number;
		limit: number;
		status?: ReportStatus;
	}): Promise<PlayerReport[]> {
		const rows = (await this.db.query(
			`SELECT ${columns} FROM player_reports WHERE ($1::text IS NULL OR status=$1)
   ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3`,
			[input.status ?? null, input.limit, (input.page - 1) * input.limit],
		)) as StoredReport[];
		return rows.map(reportView);
	}
	async get(id: string): Promise<ReportDetail | null> {
		// One statement gives the status and audit trail the same database snapshot.
		const rows = (await this.db.query(
			`SELECT ${columns}, COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',r.id,'adminUserId',r.admin_user_id,'fromStatus',r.from_status,'toStatus',r.to_status,
   'note',r.note,'createdAt',r.created_at,'revision',r.revision) ORDER BY r.revision)
   FROM player_report_reviews r WHERE r.report_id=player_reports.id),'[]'::jsonb) AS reviews
   FROM player_reports WHERE id=$1`,
			[id],
		)) as (StoredReport & { reviews: ReportReview[] })[];
		if (!rows[0]) return null;
		return {
			...reportView(rows[0]),
			reviews: rows[0].reviews.map((row) => ({
				...row,
				createdAt: new Date(row.createdAt).toISOString(),
			})),
		};
	}
	async review(input: ReviewReportInput): ReturnType<PlayerReportRepository["review"]> {
		return this.db.transaction(async (tx) => {
			const rows = (await tx.query(`SELECT ${columns} FROM player_reports WHERE id=$1 FOR UPDATE`, [
				input.id,
			])) as StoredReport[];
			const current = rows[0];
			if (!current) return { outcome: "missing" };
			if (current.revision !== input.expectedRevision) return { outcome: "conflict" };
			const changed = (await tx.query(
				`UPDATE player_reports SET status=$2,revision=revision+1,updated_at=$3 WHERE id=$1 RETURNING ${columns}`,
				[input.id, input.status, input.now],
			)) as StoredReport[];
			await tx.query(
				`INSERT INTO player_report_reviews(report_id,admin_user_id,from_status,to_status,note,revision,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
				[
					input.id,
					input.adminUserId,
					current.status,
					input.status,
					input.note,
					changed[0].revision,
					input.now,
				],
			);
			return { outcome: "accepted", report: reportView(changed[0]) };
		});
	}
}
