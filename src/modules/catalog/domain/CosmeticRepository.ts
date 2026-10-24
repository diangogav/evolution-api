import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { Cosmetic } from "./Cosmetic";

export interface CosmeticRepository {
	findAll(): Promise<Cosmetic[]>;
	// `manager` joins a transaction another module opened, so the lookup never takes a
	// second pool connection while that transaction holds one.
	findById(id: string, manager?: QueryableManager): Promise<Cosmetic | null>;
	save(cosmetic: Cosmetic): Promise<void>;
}
