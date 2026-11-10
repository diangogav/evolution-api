// Catalog codes of the achievements a lightning tournament unlocks. The API is their only
// writer (the duel server writes the match achievements); the catalog rows are seeded by
// an evolution-types migration with no ranked points, so they only pay essence.
export const LIGHTNING_ACHIEVEMENT_CODES = [
	"LIGHTNING_FIRST",
	"LIGHTNING_PODIUM",
	"LIGHTNING_CHAMPION",
	"LIGHTNING_UNBEATEN",
	"LIGHTNING_CHAMPION_5",
] as const;

export type LightningAchievementCode = (typeof LIGHTNING_ACHIEVEMENT_CODES)[number];

/** An achievement as a tournament result remembers it: what the player saw unlock. */
export type UnlockedLightningAchievement = {
	code: string;
	name: string;
	essenceReward: number;
};

export const PODIUM_POSITIONS = 3;
export const CHAMPION_5_WINS = 5;

export type LightningAchievementFacts = {
	/** Final position of a ranked player (every ranked player has played at least one game). */
	position: number;
	losses: number;
	/** Tournaments the player won before this one. */
	priorWins: number;
};

/**
 * Codes a ranked player qualifies for with this result. Achievements are held once per
 * player, so the caller drops the ones already held; that is also why the first-tournament
 * and five-win codes ask "has it happened by now" rather than "is this exactly the one":
 * a player whose qualifying tournament closed before the catalog row existed still gets it
 * on the next one.
 */
export function lightningAchievements(
	facts: LightningAchievementFacts,
): LightningAchievementCode[] {
	const codes: LightningAchievementCode[] = ["LIGHTNING_FIRST"];
	if (facts.position <= PODIUM_POSITIONS) codes.push("LIGHTNING_PODIUM");
	if (facts.position !== 1) return codes;
	codes.push("LIGHTNING_CHAMPION");
	if (facts.losses === 0) codes.push("LIGHTNING_UNBEATEN");
	if (facts.priorWins + 1 >= CHAMPION_5_WINS) codes.push("LIGHTNING_CHAMPION_5");
	return codes;
}
