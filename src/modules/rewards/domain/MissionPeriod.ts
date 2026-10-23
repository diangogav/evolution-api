import { MissionPeriod } from "./Mission";

// Periods are keyed in UTC so every player shares the same reset moment regardless
// of where they play from. Daily keys are calendar days; weekly keys follow ISO 8601
// (weeks start on Monday, week 1 holds the year's first Thursday).
export function periodKey(period: MissionPeriod, date: Date): string {
	return period === "daily" ? dayKey(date) : isoWeekKey(date);
}

function dayKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function isoWeekKey(date: Date): string {
	const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const weekday = target.getUTCDay() || 7;
	target.setUTCDate(target.getUTCDate() + 4 - weekday);
	const isoYear = target.getUTCFullYear();
	const yearStart = Date.UTC(isoYear, 0, 1);
	const week = Math.ceil(((target.getTime() - yearStart) / 86_400_000 + 1) / 7);
	return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
