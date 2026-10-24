import type { EntityManager, EntityTarget, ObjectLiteral, Repository } from "typeorm";

import { cosmeticsDataSource } from "../../cosmetics-data-source";
import type { QueryableManager } from "./QueryableManager";

// Picks the repository bound to the caller's transaction when one is given, so the
// query runs on that transaction's connection, and the DataSource's otherwise.
export function repositoryOn<T extends ObjectLiteral>(
	manager: QueryableManager | undefined,
	entity: EntityTarget<T>,
): Repository<T> {
	if (manager && "getRepository" in manager) {
		return (manager as EntityManager).getRepository(entity);
	}
	return cosmeticsDataSource.getRepository(entity);
}
