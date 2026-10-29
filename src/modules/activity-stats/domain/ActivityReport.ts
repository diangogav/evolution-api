import type { ActivityRange } from "./ActivityRange";

export interface BucketCount {
	readonly start: Date;
	readonly count: number;
}

/** `evoduelMatches` counts games where at least one player used EvoDuel. */
export interface RankedBanListCount {
	readonly start: Date;
	readonly banListName: string;
	readonly matches: number;
	readonly evoduelMatches: number;
}

/** `matches` and `evoduelMatches` already exclude bot games; `botMatches` counts them. */
export interface UnrankedBanListCount {
	readonly start: Date;
	readonly banListName: string;
	readonly matches: number;
	readonly evoduelMatches: number;
	readonly botMatches: number;
}

/** Sparse per-bucket counts: buckets without activity are simply missing. */
export interface ActivityCounts {
	readonly newUsers: readonly BucketCount[];
	readonly activePlayers: readonly BucketCount[];
	readonly rankedMatches: readonly RankedBanListCount[];
	readonly unrankedMatches: readonly UnrankedBanListCount[];
}

export interface ActivityStatsRepository {
	countActivity(range: ActivityRange): Promise<ActivityCounts>;
}

export interface ActivityBucket {
	start: Date;
	newUsers: number;
	activePlayers: number;
	rankedMatches: number;
	unrankedMatches: number;
	evoduelRankedMatches: number;
	evoduelUnrankedMatches: number;
	botMatchesExcluded: number;
}

export interface BanListActivity {
	start: Date;
	banListName: string;
	rankedMatches: number;
	unrankedMatches: number;
}

export interface ActivityReport {
	readonly buckets: ActivityBucket[];
	readonly byBanList: BanListActivity[];
}

export function buildActivityReport(range: ActivityRange, counts: ActivityCounts): ActivityReport {
	const buckets = new Map<number, ActivityBucket>();
	for (const start of range.starts) {
		buckets.set(start.getTime(), {
			start,
			newUsers: 0,
			activePlayers: 0,
			rankedMatches: 0,
			unrankedMatches: 0,
			evoduelRankedMatches: 0,
			evoduelUnrankedMatches: 0,
			botMatchesExcluded: 0,
		});
	}
	const banLists = new Map<string, BanListActivity>();
	const banListEntry = (start: Date, banListName: string) => {
		const key = `${start.getTime()}|${banListName}`;
		let entry = banLists.get(key);
		if (!entry) {
			entry = { start, banListName, rankedMatches: 0, unrankedMatches: 0 };
			banLists.set(key, entry);
		}
		return entry;
	};

	for (const row of counts.newUsers) {
		const bucket = buckets.get(row.start.getTime());
		if (bucket) bucket.newUsers += row.count;
	}
	for (const row of counts.activePlayers) {
		const bucket = buckets.get(row.start.getTime());
		if (bucket) bucket.activePlayers += row.count;
	}
	for (const row of counts.rankedMatches) {
		const bucket = buckets.get(row.start.getTime());
		if (!bucket) continue;
		bucket.rankedMatches += row.matches;
		bucket.evoduelRankedMatches += row.evoduelMatches;
		if (row.matches > 0) banListEntry(bucket.start, row.banListName).rankedMatches += row.matches;
	}
	for (const row of counts.unrankedMatches) {
		const bucket = buckets.get(row.start.getTime());
		if (!bucket) continue;
		bucket.unrankedMatches += row.matches;
		bucket.evoduelUnrankedMatches += row.evoduelMatches;
		bucket.botMatchesExcluded += row.botMatches;
		if (row.matches > 0) banListEntry(bucket.start, row.banListName).unrankedMatches += row.matches;
	}

	const total = (entry: BanListActivity) => entry.rankedMatches + entry.unrankedMatches;
	const byBanList = [...banLists.values()].sort(
		(a, b) =>
			a.start.getTime() - b.start.getTime() ||
			total(b) - total(a) ||
			a.banListName.localeCompare(b.banListName),
	);
	return { buckets: [...buckets.values()], byBanList };
}
