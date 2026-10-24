import { cosmeticsDataSource } from "../../../cosmetics-data-source";
import { QueryableManager } from "../domain/EssenceLedgerRepository";
import { TransactionRunner } from "../domain/TransactionRunner";

export class CosmeticsTransactionRunner implements TransactionRunner {
	run<T>(work: (manager: QueryableManager) => Promise<T>): Promise<T> {
		return cosmeticsDataSource.transaction((txManager) =>
			work(txManager as unknown as QueryableManager),
		);
	}
}
