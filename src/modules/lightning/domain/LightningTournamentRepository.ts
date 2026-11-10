import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { LightningTournament, LightningTournamentStatus } from "./LightningTournament";

export type TournamentListing = { tournament: LightningTournament; entryCount: number };

export type TournamentListQuery = {
	statuses: LightningTournamentStatus[];
	/** Most recent start first (finished tournaments) instead of soonest first. */
	newestFirst: boolean;
	limit: number;
};

export interface LightningTournamentRepository {
	insert(tournament: LightningTournament, manager?: QueryableManager): Promise<void>;
	findById(id: string, manager?: QueryableManager): Promise<LightningTournament | null>;
	/**
	 * Locks the row until the transaction ends. Every mutation of a tournament's entries
	 * or games runs under it, so pairing, applying and the player's own requests never
	 * interleave for one tournament.
	 */
	findByIdForUpdate(id: string, manager: QueryableManager): Promise<LightningTournament | null>;
	update(tournament: LightningTournament, manager?: QueryableManager): Promise<void>;
	/**
	 * Moves the status only from the expected one, so two writers racing for the same
	 * transition (completion, cancellation) commit it once. False when it already moved.
	 */
	transitionStatus(
		id: string,
		from: LightningTournamentStatus,
		to: LightningTournamentStatus,
		now: Date,
		manager: QueryableManager,
	): Promise<boolean>;
	/** Tournaments in the given statuses with their active entry counts. */
	list(query: TournamentListQuery, manager?: QueryableManager): Promise<TournamentListing[]>;
	/** Ids of every tournament that is not completed or cancelled yet, oldest start first. */
	listOpenIds(manager: QueryableManager): Promise<string[]>;
}
