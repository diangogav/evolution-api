import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { AvatarConfig } from "../domain/AvatarConfig";
import { PlayerAvatarRepository } from "../domain/PlayerAvatarRepository";

export type MyAvatarResult = { config: AvatarConfig };

export class GetMyAvatar {
	constructor(private readonly avatars: PlayerAvatarRepository) {}

	async run(userId: string): Promise<MyAvatarResult> {
		const config = await this.avatars.findByUserId(userId);
		if (!config) throw new NotFoundError("You have no avatar yet");
		return { config };
	}
}
