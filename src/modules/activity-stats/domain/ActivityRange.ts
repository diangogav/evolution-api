export const ACTIVITY_PERIODS = ["day", "week", "month"] as const;

export type ActivityPeriod = (typeof ACTIVITY_PERIODS)[number];

export const BUCKET_LIMITS: Record<ActivityPeriod, { default: number; max: number }> = {
	day: { default: 30, max: 92 },
	week: { default: 12, max: 53 },
	month: { default: 12, max: 24 },
};

/**
 * The last `count` UTC buckets of a period, the current (still open) one included.
 * `to` is exclusive: the start of the bucket after the current one.
 */
export interface ActivityRange {
	readonly period: ActivityPeriod;
	readonly from: Date;
	readonly to: Date;
	readonly starts: readonly Date[];
}

const DAY_MS = 86_400_000;

export function activityRange(
	period: ActivityPeriod,
	now: Date,
	count: number = BUCKET_LIMITS[period].default,
): ActivityRange {
	const { max } = BUCKET_LIMITS[period];
	if (!Number.isInteger(count) || count < 1 || count > max) {
		throw new RangeError(`A ${period} range takes between 1 and ${max} buckets, got ${count}`);
	}
	const current = bucketStart(period, now);
	const starts: Date[] = [];
	for (let offset = count - 1; offset >= 0; offset--) {
		starts.push(shift(period, current, -offset));
	}
	return { period, from: starts[0] as Date, to: shift(period, current, 1), starts };
}

// Mirrors Postgres `date_trunc` on UTC timestamps, where weeks start on Monday.
function bucketStart(period: ActivityPeriod, date: Date): Date {
	const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	if (period === "day") return new Date(day);
	if (period === "week") {
		const daysSinceMonday = (new Date(day).getUTCDay() + 6) % 7;
		return new Date(day - daysSinceMonday * DAY_MS);
	}
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function shift(period: ActivityPeriod, start: Date, buckets: number): Date {
	if (period === "day") return new Date(start.getTime() + buckets * DAY_MS);
	if (period === "week") return new Date(start.getTime() + buckets * 7 * DAY_MS);
	return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + buckets, 1));
}
