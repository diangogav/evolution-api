import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";
import { GetPlayerReport } from "../../modules/player-reports/application/GetPlayerReport";
import { ListPlayerReports } from "../../modules/player-reports/application/ListPlayerReports";
import { ListReportableMatches } from "../../modules/player-reports/application/ListReportableMatches";
import { ReviewPlayerReport } from "../../modules/player-reports/application/ReviewPlayerReport";
import { SubmitPlayerReport } from "../../modules/player-reports/application/SubmitPlayerReport";
import { PlayerReportPostgresRepository } from "../../modules/player-reports/infrastructure/PlayerReportPostgresRepository";
import {
	AdminReportPageQuery,
	PlayerReportSchema,
	ReportDetailSchema,
	ReportPageQuery,
	ReportReceiptSchema,
	ReportableMatchesSchema,
	ReviewReportSchema,
	SubmitReportSchema,
} from "../../modules/player-reports/infrastructure/PlayerReportSchemas";
import { type AdminAuthorizer, adminAuthorizer } from "../auth/AdminAuthorizer";
import { requireUser } from "../auth/requireUser";
import { errorResponses, jsonOk } from "../openapi/responses";

type PlayerDependencies = {
	listMatches: Pick<ListReportableMatches, "run">;
	submit: Pick<SubmitPlayerReport, "run">;
	requireUser?: typeof requireUser;
};
const security = [{ bearerAuth: [] }];
export const createPlayerReportsRouter = ({
	listMatches,
	submit,
	requireUser: authenticate = requireUser,
}: PlayerDependencies) =>
	new Elysia({ prefix: "/me/player-reports" }).guard({}, (app) =>
		app
			.use(authenticate)
			.get(
				"/matches",
				({ userId, query }) => listMatches.run({ ...query, reporterId: userId, now: new Date() }),
				{
					query: ReportPageQuery,
					response: { 200: ReportableMatchesSchema },
					detail: {
						tags: ["Player Reports"],
						security,
						summary: "List my reportable matches",
						description:
							"Lists the caller's completed ranked matches from the last 30 days. Opponents are resolved from server-recorded account IDs; migrated or guest-only history without IDs is excluded.",
						responses: {
							200: jsonOk(ReportableMatchesSchema, "Recent matches with reportable opponents"),
							...errorResponses(400, 401, 403, 422),
						},
					},
				},
			)
			.post(
				"/",
				({ userId, body }) => submit.run({ ...body, reporterId: userId, now: new Date() }),
				{
					body: SubmitReportSchema,
					response: { 200: ReportReceiptSchema },
					detail: {
						tags: ["Player Reports"],
						security,
						summary: "Report a match opponent",
						description:
							"Creates private moderator evidence for an authenticated opponent in the caller's recent match. At most five new reports per rolling 24 hours. Repeating the same reporter/game/opponent returns its original receipt without replacing the allegation. Reports do not impose penalties. Client text is unverified; no client logs or file paths are accepted.",
						responses: {
							200: jsonOk(ReportReceiptSchema, "Report receipt, including idempotent duplicates"),
							...errorResponses(400, 401, 403, 404, 409, 422),
						},
					},
				},
			),
	);

type AdminDependencies = {
	authorizer: AdminAuthorizer;
	list: Pick<ListPlayerReports, "run">;
	get: Pick<GetPlayerReport, "run">;
	review: Pick<ReviewPlayerReport, "run">;
};
const reportId = t.Object({ id: t.String({ format: "uuid" }) });
export const createAdminPlayerReportsRouter = ({
	authorizer,
	list,
	get,
	review,
}: AdminDependencies) =>
	new Elysia({ prefix: "/admin/player-reports" })
		.use(bearer())
		.get(
			"/",
			({ bearer, query }) => {
				authorizer.requireAdmin(bearer);
				return list.run(query);
			},
			{
				query: AdminReportPageQuery,
				response: { 200: t.Array(PlayerReportSchema) },
				detail: {
					tags: ["Player Reports Admin"],
					security,
					summary: "List private player reports",
					description:
						"Administrator-only moderation queue, newest first. Allegations are untrusted plain text; context is an immutable snapshot read from server match records.",
					responses: {
						200: jsonOk(t.Array(PlayerReportSchema), "Reports for administrative review"),
						...errorResponses(400, 401, 403, 422),
					},
				},
			},
		)
		.get(
			"/:id",
			({ bearer, params }) => {
				authorizer.requireAdmin(bearer);
				return get.run(params.id);
			},
			{
				params: reportId,
				response: { 200: ReportDetailSchema },
				detail: {
					tags: ["Player Reports Admin"],
					security,
					summary: "Read a report and review trail",
					description:
						"Returns a private report with immutable match context and append-only administrative review history. The game ID correlates operator-held game-server logs; no secrets or replay deck contents are collected automatically.",
					responses: {
						200: jsonOk(ReportDetailSchema, "Report and review history"),
						...errorResponses(401, 403, 404, 422),
					},
				},
			},
		)
		.post(
			"/:id/reviews",
			({ bearer, params, body }) => {
				const admin = authorizer.requireAdmin(bearer);
				return review.run({ ...body, id: params.id, adminUserId: admin.userId, now: new Date() });
			},
			{
				params: reportId,
				body: ReviewReportSchema,
				response: { 200: PlayerReportSchema },
				detail: {
					tags: ["Player Reports Admin"],
					security,
					summary: "Record an administrative review",
					description:
						"Appends the authenticated administrator's status decision and note in the same transaction as the revision update. expectedRevision prevents one moderator from overwriting another. This endpoint never bans a user or annuls a match.",
					responses: {
						200: jsonOk(PlayerReportSchema, "Report with updated status and revision"),
						...errorResponses(400, 401, 403, 404, 409, 422),
					},
				},
			},
		);

const repository = new PlayerReportPostgresRepository();
export const playerReportsRouter = createPlayerReportsRouter({
	listMatches: new ListReportableMatches(repository),
	submit: new SubmitPlayerReport(repository),
});
export const adminPlayerReportsRouter = createAdminPlayerReportsRouter({
	authorizer: adminAuthorizer,
	list: new ListPlayerReports(repository),
	get: new GetPlayerReport(repository),
	review: new ReviewPlayerReport(repository),
});
