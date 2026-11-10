import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { LightningEntry } from "./LightningEntry";

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
}
