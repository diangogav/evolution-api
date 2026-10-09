/** Wins at the head of outcomes ordered from the most recent match to the oldest. */
export function currentStreak(winnersLatestFirst: boolean[]): number {
	const firstLoss = winnersLatestFirst.indexOf(false);

	return firstLoss === -1 ? winnersLatestFirst.length : firstLoss;
}
