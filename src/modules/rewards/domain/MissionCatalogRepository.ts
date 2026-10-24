import { Mission } from "./Mission";

export interface MissionCatalogRepository {
	findActive(): Promise<Mission[]>;
}
