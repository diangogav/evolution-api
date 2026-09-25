import type { TierGame } from "../../../../../src/modules/tiers/domain/TierGame";

/**
 * Slices trimmed from the season 7 TCG and Edison ledgers. Every user and game
 * id is synthetic (p1..pN, g1..gN, scoped per slice), only the points, the
 * outcome, the opponent shape and the timing survive. Rows created before the
 * backfill cutoff carry a synthesized duelAt because the real ledger
 * timestamps of that window are bulk-backfill times, not match times.
 */

const at = (iso: string): number => Date.parse(iso);

export function tierGame(overrides: Partial<TierGame> = {}): TierGame {
	return {
		gameId: "g1",
		userId: "p1",
		rankId: "rank-1",
		opponentId: "p2",
		pointsDelta: 2,
		won: true,
		appliedId: "a1",
		appliedAt: at("2026-09-15T12:00:00Z"),
		duelAt: null,
		...overrides,
	};
}

type Seed = [
	game: number,
	opponentId: string | null,
	pointsDelta: number,
	appliedAt: string,
	duelAt?: string,
];

function slice(rankId: string, seeds: Seed[]): TierGame[] {
	return seeds.map(([game, opponentId, pointsDelta, appliedAt, duelAt]) =>
		tierGame({
			gameId: `g${game}`,
			rankId,
			opponentId,
			pointsDelta,
			won: pointsDelta > 0,
			appliedId: `a${game}`,
			appliedAt: at(appliedAt),
			duelAt: duelAt === undefined ? null : at(duelAt),
		}),
	);
}

/**
 * Slice 1. The first four Edison games of one player, all written by the
 * 2026-09-09 backfill: g3 and g4 share a byte-identical created_at. The
 * synthesized duel times run in the opposite direction of the ledger order.
 */
export const edisonBackfillBurst: TierGame[] = slice("rank-edison", [
	[1, "p2", 2, "2026-09-09T18:36:26.625Z", "2026-09-09T17:40:00Z"],
	[2, "p3", 2, "2026-09-09T19:21:38.220Z", "2026-09-09T17:30:00Z"],
	[3, "p3", 2, "2026-09-09T19:21:40.514Z", "2026-09-09T17:20:00Z"],
	[4, "p4", 2, "2026-09-09T19:21:40.514Z", "2026-09-09T17:10:00Z"],
]);

/**
 * Slice 2. The seven Edison games between the same two players on one UTC day
 * (five wins, two losses for p1): six points uncapped, four under the cap.
 */
export const edisonSameDaySession: TierGame[] = slice("rank-edison", [
	[1, "p3", 2, "2026-09-09T19:21:38.220Z", "2026-09-09T16:00:00Z"],
	[2, "p3", 2, "2026-09-09T19:21:40.514Z", "2026-09-09T16:07:00Z"],
	[3, "p3", -2, "2026-09-09T19:55:35.270Z", "2026-09-09T16:15:00Z"],
	[4, "p3", 2, "2026-09-09T19:55:40.023Z", "2026-09-09T16:22:00Z"],
	[5, "p3", 2, "2026-09-09T19:55:45.271Z", "2026-09-09T16:30:00Z"],
	[6, "p3", -2, "2026-09-09T19:56:14.378Z", "2026-09-09T16:38:00Z"],
	[7, "p3", 2, "2026-09-09T19:58:41.607Z", "2026-09-09T16:45:00Z"],
]);

/**
 * Slice 3. A TCG player who reaches 10 effective points on g9 and then loses
 * below it: without the Gold floor the same rows end at 9 (Silver). g10 and
 * g15 are third same-day games against p7 and p4 and do not move points.
 */
export const tcgGoldThenLosses: TierGame[] = slice("rank-tcg", [
	[1, "p2", 2, "2026-09-09T19:46:18.139Z", "2026-09-09T15:00:00Z"],
	[2, "p3", -1, "2026-09-09T19:46:55.862Z", "2026-09-09T15:04:00Z"],
	[3, "p4", 1, "2026-09-09T19:46:55.862Z", "2026-09-09T15:08:00Z"],
	[4, "p4", 2, "2026-09-09T19:47:05.345Z", "2026-09-09T15:12:00Z"],
	[5, "p5", 2, "2026-09-09T19:47:12.043Z", "2026-09-09T15:16:00Z"],
	[6, "p6", 1, "2026-09-09T19:55:30.598Z", "2026-09-09T15:20:00Z"],
	[7, "p7", 1, "2026-09-09T19:56:02.607Z", "2026-09-09T15:24:00Z"],
	[8, "p8", 1, "2026-09-09T19:56:52.896Z", "2026-09-09T15:28:00Z"],
	[9, "p7", 1, "2026-09-09T19:58:26.067Z", "2026-09-09T15:32:00Z"],
	[10, "p7", 1, "2026-09-09T19:58:28.748Z", "2026-09-09T15:36:00Z"],
	[11, "p9", -1, "2026-09-09T19:58:32.120Z", "2026-09-09T15:40:00Z"],
	[12, "p10", -1, "2026-09-09T19:58:37.142Z", "2026-09-09T15:44:00Z"],
	[13, "p11", 1, "2026-09-09T19:58:41.607Z", "2026-09-09T15:48:00Z"],
	[14, "p12", 1, "2026-09-09T19:58:43.449Z", "2026-09-09T15:52:00Z"],
	[15, "p4", 1, "2026-09-09T19:59:08.971Z", "2026-09-09T15:56:00Z"],
	[16, "p13", -1, "2026-09-09T19:59:43.913Z", "2026-09-09T16:00:00Z"],
	[17, "p14", -1, "2026-09-09T21:07:39.093Z", "2026-09-09T16:04:00Z"],
	[18, "p14", 1, "2026-09-09T21:49:36.954Z", "2026-09-09T16:08:00Z"],
]);

/**
 * Slice 4. Cross-day win trading in the TCG shape (+2 and +1 wins): two games
 * per UTC day against the same opponent for twenty days, sixty effective
 * points and a single beaten opponent. No season 7 player reached 25 points
 * with fewer than five distinct opponents, so this slice is synthesized.
 */
export const tcgWinTrading: TierGame[] = slice(
	"rank-tcg",
	Array.from({ length: 20 }, (_, day): Seed[] => {
		const date = new Date(Date.UTC(2026, 8, 12 + day)).toISOString().slice(0, 10);
		return [
			[2 * day + 1, "p2", 2, `${date}T20:00:00Z`],
			[2 * day + 2, "p2", 1, `${date}T20:30:00Z`],
		];
	}).flat(),
);

/**
 * Slice 5. A TCG window around a game that was annulled and reinstated. The
 * ledger holds applied, reversal and reinstatement rows for g3; the replay
 * only ever sees it as one net row at its original game time, or not at all.
 */
export const tcgReinstatedWindow: TierGame[] = slice("rank-tcg", [
	[1, "p2", -2, "2026-09-09T19:46:46.533Z", "2026-09-09T15:00:00Z"],
	[2, "p3", 1, "2026-09-09T19:46:53.407Z", "2026-09-09T15:05:00Z"],
	[4, "p3", 2, "2026-09-09T19:58:37.142Z", "2026-09-09T15:15:00Z"],
	[5, "p5", 2, "2026-09-09T19:59:14.215Z", "2026-09-09T15:20:00Z"],
	[6, "p5", 1, "2026-09-12T23:42:46.883Z"],
	[7, "p5", 2, "2026-09-13T00:39:10.992Z"],
	[8, "p3", -2, "2026-09-13T02:46:13.694Z"],
]);

export const tcgReinstatedGame: TierGame = slice("rank-tcg", [
	[3, "p4", 2, "2026-09-09T19:56:35.153Z", "2026-09-09T15:10:00Z"],
])[0];
