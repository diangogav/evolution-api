import { AnnulmentRequest } from "./AnnulmentRequest";
import { PhaseOneResult } from "./PhaseOneResult";

// Structural type covering only what phase 1 needs from an EntityManager;
// mirrors QueryableManager from points-ledger/rating so a caller could
// compose these calls inside its own transaction if it ever needs to.
export type QueryableManager = { query: (sql: string, parameters?: unknown[]) => Promise<unknown> };

// Un-annul (unannulPhaseOne) ships in a follow-up slice; the parametrised
// design keeps this a clean, additive cut (see D1.1/D5).
export interface MatchAnnulmentRepository {
	annulPhaseOne(request: AnnulmentRequest, manager?: QueryableManager): Promise<PhaseOneResult>;
}
