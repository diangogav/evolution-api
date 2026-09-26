import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { AnnulMatchesUseCase } from "../../modules/match-annulment/application/AnnulMatchesUseCase";
import { UnannulMatchesUseCase } from "../../modules/match-annulment/application/UnannulMatchesUseCase";
import {
	AnnulMatchesResultSchema,
	UnannulMatchesResultSchema,
} from "../../modules/match-annulment/infrastructure/AnnulmentSchemas";
import { MatchAnnulmentPostgresRepository } from "../../modules/match-annulment/infrastructure/MatchAnnulmentPostgresRepository";
import { PointsLedgerPostgresRepository } from "../../modules/points-ledger/infrastructure/PointsLedgerPostgresRepository";
import { AnnulledMatchRatingCompensator } from "../../modules/rating/application/AnnulledMatchRatingCompensator";
import { ReinstatedMatchRatingCompensator } from "../../modules/rating/application/ReinstatedMatchRatingCompensator";
import { RatingCompensationPostgresRepository } from "../../modules/rating/infrastructure/RatingCompensationPostgresRepository";
import { JWT } from "../../shared/JWT";
import { errorResponses, jsonOk } from "../openapi/responses";
import type { AdminAuthorizer } from "../auth/AdminAuthorizer";
import { JwtAdminAuthorizer } from "../auth/AdminAuthorizer";

export interface AdminModerationRouterDependencies {
	readonly authorizer: AdminAuthorizer;
	readonly annulMatches: AnnulMatchesUseCase;
	readonly unannulMatches: UnannulMatchesUseCase;
}

export function createAdminModerationRouter(deps: AdminModerationRouterDependencies) {
	return new Elysia({ prefix: "/admin/matches" })
		.use(bearer())
		.post(
			"/annulments",
			({ bearer: token, body }) => {
				const principal = deps.authorizer.requireAdmin(token);
				return deps.annulMatches.run({
					gameIds: body.gameIds,
					reason: body.reason,
					offenderUserId: body.offenderUserId,
					adminUserId: principal.userId,
				});
			},
			{
				body: t.Object({
					gameIds: t.Array(t.String()),
					reason: t.String(),
					offenderUserId: t.String(),
				}),
				detail: {
					tags: ["Match Moderation"],
					summary: "Annul a batch of matches, reversing points and Elo",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(AnnulMatchesResultSchema, "Per-game outcome and Elo totals for the batch", {
							results: [
								{
									gameId: "game-1",
									outcome: "annulled",
									pointsRows: 2,
									eloReversed: 2,
									eloSkipped: 0,
									eloReinstated: 0,
								},
								{
									gameId: "game-2",
									outcome: "conflict",
									pointsRows: 0,
									eloReversed: 0,
									eloSkipped: 0,
									eloReinstated: 0,
									reason: "summary-key-mismatch",
								},
							],
							totals: { eloReversed: 2, eloSkipped: 0 },
						}),
						...errorResponses(400, 401, 403, 409, 422),
					},
				},
			},
		)
		.post(
			"/annulments/reversals",
			({ bearer: token, body }) => {
				deps.authorizer.requireAdmin(token);
				return deps.unannulMatches.run({ gameIds: body.gameIds });
			},
			{
				body: t.Object({ gameIds: t.Array(t.String()) }),
				detail: {
					tags: ["Match Moderation"],
					summary: "Reverse a batch of match annulments, restoring points",
					security: [{ bearerAuth: [] }],
					responses: {
						200: jsonOk(
							UnannulMatchesResultSchema,
							"Per-game outcome and Elo totals for the batch",
							{
								results: [
									{
										gameId: "game-1",
										outcome: "un-annulled",
										pointsRows: 2,
										eloReversed: 0,
										eloSkipped: 0,
										eloReinstated: 2,
									},
								],
								totals: { eloReinstated: 2, eloSkipped: 0 },
							},
						),
						...errorResponses(400, 401, 403, 409, 422),
					},
				},
			},
		);
}

const ledger = new PointsLedgerPostgresRepository();
const matchAnnulmentRepository = new MatchAnnulmentPostgresRepository(ledger);
const ratingCompensationRepository = new RatingCompensationPostgresRepository();
const compensator = new AnnulledMatchRatingCompensator(ratingCompensationRepository);
const reinstatementCompensator = new ReinstatedMatchRatingCompensator(ratingCompensationRepository);

export const adminModerationRouter = createAdminModerationRouter({
	authorizer: new JwtAdminAuthorizer(new JWT(config.jwt)),
	annulMatches: new AnnulMatchesUseCase(
		matchAnnulmentRepository,
		compensator,
		config.annulment.enabled,
	),
	unannulMatches: new UnannulMatchesUseCase(
		matchAnnulmentRepository,
		reinstatementCompensator,
		config.annulment.enabled,
	),
});
