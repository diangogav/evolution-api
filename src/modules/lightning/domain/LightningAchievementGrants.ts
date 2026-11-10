import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { UnlockedLightningAchievement } from "./lightningAchievements";

export type CatalogLightningAchievement = UnlockedLightningAchievement & { id: number };

export type LightningAchievementGrant = {
	userId: string;
	achievementId: number;
	season: number;
	unlockedAt: Date;
};

/**
 * The shared achievements catalog and `user_achievements`, as the API writes the lightning
 * codes into them. Rows must look exactly like the duel server's, because the profile,
 * the stats and the rewards worker read both writers' rows the same way.
 */
export interface LightningAchievementGrants {
	/** Live catalog rows for the codes; a code without a row (not seeded yet) is absent. */
	findByCodes(
		codes: readonly string[],
		manager: QueryableManager,
	): Promise<CatalogLightningAchievement[]>;
	/** Holds the per-player lock the duel server's awarder takes, until the transaction ends. */
	lockPlayer(userId: string, manager: QueryableManager): Promise<void>;
	/** Which of these achievements the player already holds, in any season. */
	heldAchievementIds(
		userId: string,
		achievementIds: number[],
		manager: QueryableManager,
	): Promise<Set<number>>;
	grant(grant: LightningAchievementGrant, manager: QueryableManager): Promise<void>;
}
