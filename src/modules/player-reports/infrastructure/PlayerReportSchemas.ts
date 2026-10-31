import { t } from "elysia";
import { REPORT_REASONS, REPORT_STATUSES } from "../domain/PlayerReport";
export const ReportReasonSchema = t.UnionEnum([...REPORT_REASONS]);
export const ReportStatusSchema = t.UnionEnum([...REPORT_STATUSES]);
const identity = t.String({ minLength: 1, maxLength: 128 });
const timestamp = t.String({ format: "date-time" });
export const ReportReceiptSchema = t.Object({
	id: t.String({ format: "uuid" }),
	status: ReportStatusSchema,
	createdAt: timestamp,
});
export const ReportableMatchesSchema = t.Array(
	t.Object({
		gameId: identity,
		date: timestamp,
		banListName: t.String(),
		playerScore: t.Number(),
		opponentScore: t.Number(),
		opponents: t.Array(t.Object({ userId: identity, username: t.String() })),
	}),
);
export const SubmitReportSchema = t.Object(
	{
		gameId: t.String({ format: "uuid" }),
		reportedUserId: identity,
		reason: ReportReasonSchema,
		details: t.String({
			minLength: 10,
			maxLength: 2000,
			description:
				"Player allegation, not verified evidence. Do not include passwords or access tokens.",
		}),
	},
	{ additionalProperties: false },
);
const context = t.Object({
	matchId: t.String(),
	gameId: identity,
	date: timestamp,
	banListName: t.String(),
	bestOf: t.Number(),
	playerScore: t.Number(),
	opponentScore: t.Number(),
	playerIds: t.Array(t.String()),
	opponentIds: t.Array(t.String()),
	playerNames: t.Array(t.String()),
	opponentNames: t.Array(t.String()),
	reporterUsername: t.String(),
	reportedUsername: t.String(),
});
export const PlayerReportSchema = t.Object({
	...ReportReceiptSchema.properties,
	reporterId: identity,
	reportedUserId: identity,
	gameId: identity,
	reason: ReportReasonSchema,
	details: t.String(),
	context,
	updatedAt: timestamp,
	revision: t.Integer({ minimum: 1 }),
});
export const ReportDetailSchema = t.Object({
	...PlayerReportSchema.properties,
	reviews: t.Array(
		t.Object({
			id: t.String({ format: "uuid" }),
			adminUserId: identity,
			fromStatus: ReportStatusSchema,
			toStatus: ReportStatusSchema,
			note: t.String(),
			createdAt: timestamp,
			revision: t.Integer({ minimum: 2 }),
		}),
	),
});
export const ReviewReportSchema = t.Object(
	{
		status: ReportStatusSchema,
		note: t.String({ minLength: 3, maxLength: 2000 }),
		expectedRevision: t.Integer({ minimum: 1, maximum: 2147483646 }),
	},
	{ additionalProperties: false },
);
export const ReportPageQuery = t.Object({
	page: t.Integer({ minimum: 1, maximum: 1000, default: 1 }),
	limit: t.Integer({ minimum: 1, maximum: 50, default: 20 }),
});
export const AdminReportPageQuery = t.Object({
	...ReportPageQuery.properties,
	status: t.Optional(ReportStatusSchema),
});
