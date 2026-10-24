import { Mission, MissionPeriod } from "./Mission";
import { periodKey } from "./MissionPeriod";
import { selectDailyMissions } from "./selectDailyMissions";

export type CurrentMissions = { periodKey: string; missions: Mission[] };

// The missions a player can see and claim right now: today's daily draw, or every
// active weekly mission, together with the period key they are tracked under.
export function currentMissions(
	catalog: Mission[],
	period: MissionPeriod,
	now: Date,
): CurrentMissions {
	const key = periodKey(period, now);
	const missions =
		period === "daily"
			? selectDailyMissions(catalog, key)
			: catalog.filter((mission) => mission.period === "weekly" && mission.active);
	return { periodKey: key, missions };
}
