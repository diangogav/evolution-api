import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { RewardsUnitOfWork } from "../../rewards/domain/RewardsUnitOfWork";

// The worker's unit of work. `savepoint` isolates one item of the tick inside the locked
// transaction: a throwing item rolls back only its own writes, so one broken record never
// rolls back the whole batch (or blocks every later tick).
export interface EventRunTickUnitOfWork extends RewardsUnitOfWork {
	savepoint<T>(manager: QueryableManager, work: () => Promise<T>): Promise<T>;
}
