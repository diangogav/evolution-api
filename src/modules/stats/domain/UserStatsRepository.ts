import { UserStats } from "./UserStats";

export interface UserStatsRepository {
	find(userId: string, banListName: string): Promise<UserStats | null>;
}
