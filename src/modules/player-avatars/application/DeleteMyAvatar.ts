import { PlayerAvatarRepository } from "../domain/PlayerAvatarRepository";

export class DeleteMyAvatar {
	constructor(private readonly avatars: PlayerAvatarRepository) {}

	/** Idempotent: deleting when there is nothing saved is not an error. */
	async run(userId: string): Promise<void> {
		await this.avatars.delete(userId);
	}
}
