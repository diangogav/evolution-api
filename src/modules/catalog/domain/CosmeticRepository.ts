import { Cosmetic } from "./Cosmetic";

export interface CosmeticRepository {
	findAll(): Promise<Cosmetic[]>;
	save(cosmetic: Cosmetic): Promise<void>;
}
