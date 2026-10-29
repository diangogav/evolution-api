import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { type ActivityPeriod, activityRange, BUCKET_LIMITS } from "../domain/ActivityRange";
import { type ActivityStatsRepository, buildActivityReport } from "../domain/ActivityReport";

export interface GetActivityStatsInput {
	period: ActivityPeriod;
	buckets?: number;
	now: Date;
}

export interface GetActivityStatsResult {
	period: ActivityPeriod;
	from: string;
	to: string;
	buckets: {
		start: string;
		newUsers: number;
		activePlayers: number;
		rankedMatches: number;
		unrankedMatches: number;
		evoduelRankedMatches: number;
		evoduelUnrankedMatches: number;
		botMatchesExcluded: number;
	}[];
	byBanList: {
		start: string;
		banListName: string;
		rankedMatches: number;
		unrankedMatches: number;
	}[];
}

export class GetActivityStats {
	constructor(private readonly repository: ActivityStatsRepository) {}

	async run(input: GetActivityStatsInput): Promise<GetActivityStatsResult> {
		const { max } = BUCKET_LIMITS[input.period];
		const count = input.buckets ?? BUCKET_LIMITS[input.period].default;
		if (!Number.isInteger(count) || count < 1 || count > max) {
			throw new InvalidArgumentError(
				`buckets must be an integer between 1 and ${max} for ${input.period}`,
			);
		}

		const range = activityRange(input.period, input.now, count);
		const report = buildActivityReport(range, await this.repository.countActivity(range));

		return {
			period: range.period,
			from: range.from.toISOString(),
			to: range.to.toISOString(),
			buckets: report.buckets.map((bucket) => ({ ...bucket, start: bucket.start.toISOString() })),
			byBanList: report.byBanList.map((entry) => ({ ...entry, start: entry.start.toISOString() })),
		};
	}
}
