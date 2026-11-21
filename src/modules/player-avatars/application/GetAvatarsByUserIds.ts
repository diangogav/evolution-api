import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { AvatarConfig } from "../domain/AvatarConfig";
import { PlayerAvatarRepository } from "../domain/PlayerAvatarRepository";

export const MAX_AVATAR_LOOKUP = 100;

export type PublicAvatarsResult = { avatars: { userId: string; config: AvatarConfig }[] };

export class GetAvatarsByUserIds {
	constructor(private readonly avatars: PlayerAvatarRepository) {}

	/** `rawUserIds` is the comma-separated query value; players without an avatar are left out. */
	async run(rawUserIds: string): Promise<PublicAvatarsResult> {
		const userIds = [
			...new Set(
				rawUserIds
					.split(",")
					.map((id) => id.trim())
					.filter(Boolean),
			),
		];
		if (userIds.length > MAX_AVATAR_LOOKUP) {
			throw new InvalidArgumentError(`Ask for at most ${MAX_AVATAR_LOOKUP} players at a time`);
		}
		if (userIds.length === 0) return { avatars: [] };

		const found = await this.avatars.findByUserIds(userIds);
		return {
			avatars: userIds.flatMap((userId) => {
				const config = found.get(userId);
				return config ? [{ userId, config }] : [];
			}),
		};
	}
}
