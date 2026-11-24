/**
 * A player may rename their account once every 30 days. Frequent renames let a
 * player take the name of someone else for an evening and drop it before anyone
 * reports it, so the history is also kept for moderation.
 */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type UsernameChange = {
	userId: string;
	previousUsername: string;
	newUsername: string;
	changedAt: Date;
};

export interface UsernameChangeRepository {
	/** When the user last changed their name, or null when they never did. */
	lastChangeAt(userId: string): Promise<Date | null>;
	record(change: UsernameChange): Promise<void>;
}

export function nextUsernameChangeAt(lastChangeAt: Date): Date {
	return new Date(lastChangeAt.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS);
}
