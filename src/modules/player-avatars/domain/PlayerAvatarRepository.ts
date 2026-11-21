import { AvatarConfig } from "./AvatarConfig";

export interface PlayerAvatarRepository {
	/** The saved config, or null when the user has none or the stored value breaks the shape rules. */
	findByUserId(userId: string): Promise<AvatarConfig | null>;

	/** Configs of the given users that have one; users without a valid config are left out. */
	findByUserIds(userIds: readonly string[]): Promise<ReadonlyMap<string, AvatarConfig>>;

	/** Replaces the whole config atomically. */
	save(userId: string, config: AvatarConfig): Promise<void>;

	delete(userId: string): Promise<void>;
}
