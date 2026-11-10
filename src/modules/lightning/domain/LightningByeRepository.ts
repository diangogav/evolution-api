import type { QueryableManager } from "../../../shared/persistence/QueryableManager";

/** The bye a Swiss round gave: a won game with no opponent and no game row. */
export type LightningBye = { tournamentId: string; userId: string; round: number };

export interface LightningByeRepository {
	insert(bye: LightningBye, manager: QueryableManager): Promise<void>;
	listByTournament(tournamentId: string, manager?: QueryableManager): Promise<LightningBye[]>;
}
