import { Mission } from "./Mission";

export const DAILY_MISSIONS_PER_DAY = 3;

// Picks the day's missions from the active daily pool without storing anything: the
// choice is a pure function of the day key, so every read of the same day agrees and
// a future day cannot be predicted from the catalog alone. Result keeps catalog order.
export function selectDailyMissions(
	catalog: Mission[],
	dayKey: string,
	count: number = DAILY_MISSIONS_PER_DAY,
): Mission[] {
	const pool = catalog.filter((mission) => mission.period === "daily" && mission.active);
	const ranked = pool
		.map((mission, index) => ({ mission, index, hash: fnv1a(`${dayKey}:${mission.code}`) }))
		.sort((a, b) => a.hash - b.hash || a.index - b.index)
		.slice(0, count)
		.sort((a, b) => a.index - b.index);

	return ranked.map((entry) => entry.mission);
}

function fnv1a(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash;
}
