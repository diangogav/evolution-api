// Runs `work` only while no other process holds the same lock; answers undefined otherwise.
export interface SyncLock {
	runExclusive<T>(work: () => Promise<T>): Promise<T | undefined>;
}
