import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { AnnulMatchesUseCase } from "../../modules/match-annulment/application/AnnulMatchesUseCase";
import { UnannulMatchesUseCase } from "../../modules/match-annulment/application/UnannulMatchesUseCase";
import { MatchAnnulmentPostgresRepository } from "../../modules/match-annulment/infrastructure/MatchAnnulmentPostgresRepository";
import { PointsLedgerPostgresRepository } from "../../modules/points-ledger/infrastructure/PointsLedgerPostgresRepository";
import { AnnulledMatchRatingCompensator } from "../../modules/rating/application/AnnulledMatchRatingCompensator";
import { RatingCompensationPostgresRepository } from "../../modules/rating/infrastructure/RatingCompensationPostgresRepository";
import { JWT } from "../../shared/JWT";
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
				},
			},
		);
}

const ledger = new PointsLedgerPostgresRepository();
const matchAnnulmentRepository = new MatchAnnulmentPostgresRepository(ledger);
const compensator = new AnnulledMatchRatingCompensator(new RatingCompensationPostgresRepository());

export const adminModerationRouter = createAdminModerationRouter({
	authorizer: new JwtAdminAuthorizer(new JWT(config.jwt)),
	annulMatches: new AnnulMatchesUseCase(
		matchAnnulmentRepository,
		compensator,
		config.annulment.enabled,
	),
	unannulMatches: new UnannulMatchesUseCase(matchAnnulmentRepository, config.annulment.enabled),
});
