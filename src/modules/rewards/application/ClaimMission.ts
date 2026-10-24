import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UnprocessableError } from "../../../shared/errors/UnprocessableError";
import { EntitlementSource } from "../../entitlements/domain/EntitlementSource";
import { GrantCosmeticToUser } from "../../entitlements/application/GrantCosmeticToUser";
import { essenceLedgerEntry } from "../domain/EssenceLedgerEntry";
import { EssenceLedgerRepository, QueryableManager } from "../domain/EssenceLedgerRepository";
import { Mission, MissionReward } from "../domain/Mission";
import { MissionCatalogRepository } from "../domain/MissionCatalogRepository";
import { MissionClaimRepository } from "../domain/MissionClaimRepository";
import { RewardsProjectionRepository } from "../domain/RewardsProjectionRepository";
import { TransactionRunner } from "../domain/TransactionRunner";
import { currentMissions } from "../domain/currentMissions";
import { DAILY_MISSIONS_PER_DAY } from "../domain/selectDailyMissions";

export const DAILY_BONUS_ESSENCE = 30;

export type ClaimMissionInput = { userId: string; code: string; now: Date };
export type ClaimMissionResult = {
	balance: number;
	reward: MissionReward;
	/** Essence credited on top of the reward because this claim completed the day; 0 otherwise. */
	dailyBonus: number;
};

// Only the current period can be claimed; a day that ended with completed but
// unclaimed missions pays nothing. A cosmetic reward is granted before the claim row is
// written: the grant is idempotent, so a lost race leaves the entitlement in place and
// the claim conflict is still reported.
export class ClaimMission {
	constructor(
		private readonly catalog: MissionCatalogRepository,
		private readonly projection: RewardsProjectionRepository,
		private readonly claims: MissionClaimRepository,
		private readonly ledger: EssenceLedgerRepository,
		private readonly grantCosmetic: Pick<GrantCosmeticToUser, "runForUserId">,
		private readonly transactions: TransactionRunner,
	) {}

	async run(input: ClaimMissionInput): Promise<ClaimMissionResult> {
		const catalog = await this.catalog.findActive();
		const located = locate(catalog, input.code, input.now);
		if (!located) throw new NotFoundError(`Mission "${input.code}" not found`);
		const { mission, periodKey, dailyIds } = located;

		const [progress] = await this.projection.loadProgress(input.userId, [
			{ missionId: mission.id, periodKey },
		]);
		if (!progress?.completed) throw new UnprocessableError("Mission not completed");

		if (mission.reward.type === "cosmetic") {
			await this.grantCosmetic.runForUserId({
				userId: input.userId,
				cosmeticId: mission.reward.cosmeticId,
				source: EntitlementSource.CAMPAIGN,
			});
		}

		const { balance, dailyBonus } = await this.transactions.run(async (manager) => {
			await this.claims.lockUserPeriod(input.userId, periodKey, manager);
			const inserted = await this.claims.insert(input.userId, mission.id, periodKey, manager);
			if (inserted === "skipped") throw new ConflictError("Mission already claimed");

			await this.payEssence(input.userId, mission, periodKey, manager);
			const dailyBonus =
				mission.period === "daily"
					? await this.payDailyBonus(input.userId, dailyIds, periodKey, manager)
					: 0;
			return { balance: await this.ledger.balanceOf(input.userId, manager), dailyBonus };
		});

		return { balance, reward: mission.reward, dailyBonus };
	}

	private async payEssence(
		userId: string,
		mission: Mission,
		periodKey: string,
		manager: QueryableManager,
	): Promise<void> {
		if (mission.reward.type !== "essence") return;
		await this.ledger.append(
			essenceLedgerEntry({
				userId,
				kind: "mission",
				referenceKey: `${mission.code}:${periodKey}`,
				delta: mission.reward.amount,
			}),
			manager,
		);
	}

	private async payDailyBonus(
		userId: string,
		dailyIds: string[],
		periodKey: string,
		manager: QueryableManager,
	): Promise<number> {
		const claimed = await this.claims.countClaims(userId, dailyIds, periodKey, manager);
		if (claimed < DAILY_MISSIONS_PER_DAY) return 0;
		const appended = await this.ledger.append(
			essenceLedgerEntry({
				userId,
				kind: "daily_bonus",
				referenceKey: periodKey,
				delta: DAILY_BONUS_ESSENCE,
			}),
			manager,
		);
		return appended === "inserted" ? DAILY_BONUS_ESSENCE : 0;
	}
}

type Located = { mission: Mission; periodKey: string; dailyIds: string[] };

// A daily mission is claimable only when it is part of today's draw; a weekly one
// whenever it is active. Anything else looks like it does not exist.
function locate(catalog: Mission[], code: string, now: Date): Located | null {
	const daily = currentMissions(catalog, "daily", now);
	const dailyIds = daily.missions.map((mission) => mission.id);
	const todays = daily.missions.find((mission) => mission.code === code);
	if (todays) return { mission: todays, periodKey: daily.periodKey, dailyIds };

	const weekly = currentMissions(catalog, "weekly", now);
	const thisWeek = weekly.missions.find((mission) => mission.code === code);
	if (thisWeek) return { mission: thisWeek, periodKey: weekly.periodKey, dailyIds };

	return null;
}
