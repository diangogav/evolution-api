import { MissionPeriod } from "./Mission";

// Periods are keyed in UTC so every player shares the same reset moment regardless
// of where they play from. Daily keys are calendar days; weekly keys follow ISO 8601
// (weeks start on Monday, week 1 holds the year's first Thursday).
export function periodKey(period: MissionPeriod, date: Date): string {
	return period === "daily" ? dayKey(date) : isoWeekKey(date);
}

const DAY_MS = 86_400_000;

// The first instant of the next period: the next 00:00 UTC for daily, the next Monday
// 00:00 UTC for weekly. Clients count down to it instead of re-deriving the reset rule.
export function periodEnd(period: MissionPeriod, date: Date): Date {
	const startOfDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	if (period === "daily") return new Date(startOfDay + DAY_MS);
	const daysUntilMonday = (8 - date.getUTCDay()) % 7 || 7;
	return new Date(startOfDay + daysUntilMonday * DAY_MS);
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
	const week = Math.ceil(((target.getTime() - yearStart) / DAY_MS + 1) / 7);
	return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
