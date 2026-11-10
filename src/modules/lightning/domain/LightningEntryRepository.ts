import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { LightningEntry, LightningPresence } from "./LightningEntry";
import { LightningGame } from "./LightningGame";
import { LightningSystem, LiveLightningTournamentStatus } from "./LightningTournament";

/** A player's active entry in a tournament not over yet, with its pending game and bye. */
export type ActiveLightningEntrySummary = {
	tournamentId: string;
	name: string;
	system: LightningSystem;
	status: LiveLightningTournamentStatus;
	startsAt: Date;
	presence: LightningPresence;
	pendingGame: LightningGame | null;
	/** The player holds the bye of the tournament's current Swiss round. */
	hasBye: boolean;
};

export interface LightningEntryRepository {
	insert(entry: LightningEntry, manager: QueryableManager): Promise<void>;
	update(entry: LightningEntry, manager: QueryableManager): Promise<void>;
	findOne(
		tournamentId: string,
		userId: string,
		manager?: QueryableManager,
	): Promise<LightningEntry | null>;
	listByTournament(tournamentId: string, manager?: QueryableManager): Promise<LightningEntry[]>;
	/** Every active entry starts waiting from `now`: the arena just started. */
	startWaiting(tournamentId: string, now: Date, manager: QueryableManager): Promise<void>;
	/** Removes the active entries of users banned since they entered; returns their ids. */
	removeBanned(tournamentId: string, manager: QueryableManager): Promise<string[]>;
	/** The user's active entries in live tournaments, soonest start first; never locks. */
	listActiveForUser(
		userId: string,
		manager?: QueryableManager,
	): Promise<ActiveLightningEntrySummary[]>;
}
