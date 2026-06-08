import { Loadout } from "./Loadout";

export interface LoadoutRepository {
	findByUserId(userId: string): Promise<Loadout>;
	save(loadout: Loadout): Promise<void>;
}
