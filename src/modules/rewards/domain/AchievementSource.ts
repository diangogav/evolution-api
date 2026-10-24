import { SourceCursor } from "./MatchSource";

// One user_achievements row joined to its catalog entry, as the worker sees it.
// `createdAt` is unlocked_at as UTC text with microseconds (it is the cursor).
export type UnlockedAchievement = {
	sourceId: string;
	createdAt: string;
	userId: string;
	earnedPoints: number;
};

// A table of unlocked achievements the worker drains in (unlocked_at, id) order, with
// its own cursor row, independent from the match sources.
export interface AchievementSource {
	readonly name: string;
	fetchAfter(cursor: SourceCursor, limit: number, notAfter: Date): Promise<UnlockedAchievement[]>;
}
