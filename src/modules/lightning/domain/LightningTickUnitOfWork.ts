import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { RewardsUnitOfWork } from "../../rewards";

// The worker's unit of work: one locked transaction per tick, and a savepoint around each
// tournament so a failing one rolls back only its own writes and the rest still commit.
export interface LightningTickUnitOfWork extends RewardsUnitOfWork {
	savepoint<T>(manager: QueryableManager, work: () => Promise<T>): Promise<T>;
}
