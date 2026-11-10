import { LightningGame } from "./LightningGame";

/** `voided`: every game of the table was voided and none replaces it yet. */
export type SwissTableState = "live" | "resolved" | "voided";

/** One pairing of a Swiss round, across the reservations an infrastructure void re-issued. */
export type SwissTable = {
	seat0UserId: string;
	seat1UserId: string;
	/** The most recent reservation: the one to watch, or the one whose result counts. */
	latest: LightningGame;
	state: SwissTableState;
};

/** Groups the games of one round (oldest issue first) into their tables, in pairing order. */
export function swissTables(games: LightningGame[]): SwissTable[] {
	const tables = new Map<string, LightningGame[]>();
	for (const game of games) {
		const key = [game.seat0UserId, game.seat1UserId].sort().join("|");
		tables.set(key, [...(tables.get(key) ?? []), game]);
	}
	return [...tables.values()].map((reservations) => {
		const latest = reservations[reservations.length - 1];
		return {
			seat0UserId: reservations[0].seat0UserId,
			seat1UserId: reservations[0].seat1UserId,
			latest,
			state: reservations.some((game) => game.status === "applied")
				? "resolved"
				: reservations.some((game) => game.status === "pending")
					? "live"
					: "voided",
		};
	});
}

export function roundIsResolved(tables: SwissTable[]): boolean {
	return tables.every((table) => table.state === "resolved");
}
