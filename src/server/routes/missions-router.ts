import { bearer } from "@elysiajs/bearer";
import { Elysia, t } from "elysia";

import { config } from "../../config";
import { CosmeticPostgresRepository } from "../../modules/catalog/infrastructure/CosmeticPostgresRepository";
import { GrantCosmeticToUser } from "../../modules/entitlements/application/GrantCosmeticToUser";
import { EntitlementPostgresRepository } from "../../modules/entitlements/infrastructure/EntitlementPostgresRepository";
import { UserDirectoryPostgresRepository } from "../../modules/loadout/infrastructure/UserDirectoryPostgresRepository";
import { ClaimMission } from "../../modules/rewards/application/ClaimMission";
import { GetMyMissions } from "../../modules/rewards/application/GetMyMissions";
import { resolveLocale } from "../../modules/rewards/domain/LocalizedText";
import { CosmeticsTransactionRunner } from "../../modules/rewards/infrastructure/CosmeticsTransactionRunner";
import { EssenceLedgerPostgresRepository } from "../../modules/rewards/infrastructure/EssenceLedgerPostgresRepository";
import { MissionCatalogPostgresRepository } from "../../modules/rewards/infrastructure/MissionCatalogPostgresRepository";
import { MissionClaimPostgresRepository } from "../../modules/rewards/infrastructure/MissionClaimPostgresRepository";
import {
	ClaimResultSchema,
	MissionViewSchema,
} from "../../modules/rewards/infrastructure/MissionSchemas";
import { RewardsProjectionPostgresRepository } from "../../modules/rewards/infrastructure/RewardsProjectionPostgresRepository";
import { JWT } from "../../shared/JWT";
import { banGuard } from "../guards/bandGuard";
import { ErrorSchema, errorResponses, jsonOk } from "../openapi/responses";

const jwt = new JWT(config.jwt);
const catalog = new MissionCatalogPostgresRepository();
const projection = new RewardsProjectionPostgresRepository();
const claims = new MissionClaimPostgresRepository();
const ledger = new EssenceLedgerPostgresRepository();
const grantCosmetic = new GrantCosmeticToUser(
	new CosmeticPostgresRepository(),
	new EntitlementPostgresRepository(),
	new UserDirectoryPostgresRepository(),
);

const getMyMissions = new GetMyMissions(catalog, projection, claims);
const claimMission = new ClaimMission(
	catalog,
	projection,
	claims,
	ledger,
	grantCosmetic,
	new CosmeticsTransactionRunner(),
);

const missionExample = {
	code: "play_3",
	name: "Warm-up",
	description: "Play 3 duels",
	target: 3,
	value: 1,
	reward: { type: "essence", amount: 20 },
	completed: false,
	claimed: false,
};

export const missionsRouter = new Elysia({ prefix: "/me/missions" })
	.use(bearer())
	.guard(banGuard, (app) =>
		app
			.get(
				"/",
				({ bearer, query, request }) => {
					const { id } = jwt.decode(bearer as string) as { id: string };
					return getMyMissions.run({
						userId: id,
						period: query.period,
						locale: resolveLocale(request.headers.get("accept-language") ?? undefined),
						now: new Date(),
					});
				},
				{
					query: t.Object({
						period: t.Union([t.Literal("daily"), t.Literal("weekly")], {
							description: "Which period to list: today's daily draw or this ISO week's missions",
						}),
					}),
					detail: {
						tags: ["Rewards"],
						summary: "Get my missions",
						description:
							"Returns the authenticated user's missions for the current period with progress, completion and claim state. Texts are localized from Accept-Language (en or es, default en).",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(t.Array(MissionViewSchema), "Missions for the current period", [
								missionExample,
							]),
							...errorResponses(401, 403, 422),
						},
					},
				},
			)
			.post(
				"/:code/claim",
				({ bearer, params }) => {
					const { id } = jwt.decode(bearer as string) as { id: string };
					return claimMission.run({ userId: id, code: params.code, now: new Date() });
				},
				{
					params: t.Object({ code: t.String() }),
					detail: {
						tags: ["Rewards"],
						summary: "Claim a completed mission",
						description:
							"Pays the mission's reward once for the current period: essence is credited to the balance, a cosmetic is granted as an entitlement. Completing the third daily mission of the day also credits the daily bonus.",
						security: [{ bearerAuth: [] }],
						responses: {
							200: jsonOk(ClaimResultSchema, "Reward applied", {
								balance: 120,
								reward: { type: "essence", amount: 20 },
							}),
							...errorResponses(401, 403, 404, 409),
							422: {
								description: "Mission not completed",
								content: { "text/plain": { schema: ErrorSchema } },
							},
						},
					},
				},
			),
	);
