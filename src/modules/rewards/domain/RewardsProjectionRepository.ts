import { QueryableManager } from "./EssenceLedgerRepository";
import { SourceCursor } from "./MatchSource";

export type ProgressRow = {
	missionId: string;
	periodKey: string;
	value: number;
	completed: boolean;
};

export type UserRewardState = {
	lastFormat: string | null;
	rankedStreak: number;
};

export interface RewardsProjectionRepository {
	readCursor(source: string, manager?: QueryableManager): Promise<SourceCursor>;
	advanceCursor(source: string, cursor: SourceCursor, manager?: QueryableManager): Promise<void>;
	loadProgress(
		userId: string,
		pairs: Array<{ missionId: string; periodKey: string }>,
		manager?: QueryableManager,
	): Promise<ProgressRow[]>;
	saveProgress(userId: string, rows: ProgressRow[], manager?: QueryableManager): Promise<void>;
	loadUserState(userId: string, manager?: QueryableManager): Promise<UserRewardState>;
	saveUserState(userId: string, state: UserRewardState, manager?: QueryableManager): Promise<void>;
}
