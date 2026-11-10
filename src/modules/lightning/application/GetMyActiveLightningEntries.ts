import { ReservedDuelRecordReader } from "../../reserved-duel";
import { LightningPresence } from "../domain/LightningEntry";
import {
	ActiveLightningEntrySummary,
	LightningEntryRepository,
} from "../domain/LightningEntryRepository";
import { LightningGame } from "../domain/LightningGame";
import { LightningSystem, LiveLightningTournamentStatus } from "../domain/LightningTournament";
import { PlayerDirectory } from "../domain/PlayerDirectory";
import { PlayerRef } from "./GetLightningTournament";
import { MyLightningGame, myGameView, shownPresence } from "./GetMyLightningState";

export type GetMyActiveLightningEntriesInput = { userId: string };

export type ActiveLightningEntry = {
	tournamentId: string;
	name: string;
	system: LightningSystem;
	status: LiveLightningTournamentStatus;
	startsAt: string;
	state: LightningPresence;
	game: MyLightningGame | null;
	/** True when the player has the bye in the current Swiss round. */
	bye: boolean;
};

/**
 * What the client polls from any page to tell a player they were called to a duel. Unlike
 * the waiting room it applies nothing and takes no lock: a finished game shows up once the
 * worker or the tournament page applies it.
 */
export class GetMyActiveLightningEntries {
	constructor(
		private readonly entries: LightningEntryRepository,
		private readonly records: ReservedDuelRecordReader,
		private readonly players: PlayerDirectory,
	) {}

	async run(input: GetMyActiveLightningEntriesInput): Promise<ActiveLightningEntry[]> {
		const active = await this.entries.listActiveForUser(input.userId);
		const pending = active
			.map((entry) => entry.pendingGame)
			.filter((game): game is LightningGame => game !== null);
		if (pending.length === 0) {
			return active.map((entry) => ({ ...this.base(entry), game: null }));
		}

		const records = await this.records.findRecords(pending.map((game) => game.reservationId));
		const recordOf = new Map(records.map((record) => [record.reservationId, record]));
		const names = await this.players.usernamesOf(
			pending.map((game) =>
				game.seat0UserId === input.userId ? game.seat1UserId : game.seat0UserId,
			),
		);
		const ref = (userId: string): PlayerRef => ({ userId, username: names.get(userId) ?? "" });

		return active.map((entry) => ({
			...this.base(entry),
			game: entry.pendingGame ? myGameView(entry.pendingGame, input.userId, recordOf, ref) : null,
		}));
	}

	private base(entry: ActiveLightningEntrySummary): Omit<ActiveLightningEntry, "game"> {
		return {
			tournamentId: entry.tournamentId,
			name: entry.name,
			system: entry.system,
			status: entry.status,
			startsAt: entry.startsAt.toISOString(),
			state: shownPresence(entry.system, entry.presence),
			bye: entry.hasBye,
		};
	}
}
