import { avatarConfig } from "../domain/AvatarConfig";
import { PlayerAvatarRepository } from "../domain/PlayerAvatarRepository";
import { MyAvatarResult } from "./GetMyAvatar";

export type SaveMyAvatarInput = { userId: string; config: unknown };

export class SaveMyAvatar {
	constructor(private readonly avatars: PlayerAvatarRepository) {}

	async run({ userId, config }: SaveMyAvatarInput): Promise<MyAvatarResult> {
		const valid = avatarConfig(config);
		await this.avatars.save(userId, valid);
		return { config: valid };
	}
}
