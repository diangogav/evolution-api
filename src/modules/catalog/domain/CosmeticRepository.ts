import { Cosmetic } from "./Cosmetic";

export interface CosmeticRepository {
	findAll(): Promise<Cosmetic[]>;
	findById(id: string): Promise<Cosmetic | null>;
	save(cosmetic: Cosmetic): Promise<void>;
}
