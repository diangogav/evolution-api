import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Hash } from "../../../shared/Hash";
import { GamePassword } from "../domain/GamePassword";
import { UserRepository } from "../domain/UserRepository";

export class UserGamePasswordGenerator {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
	) {}

	async generate({ userId }: { userId: string }): Promise<{ gamePassword: string }> {
		const user = await this.repository.findById(userId);

		if (!user) {
			throw new NotFoundError(`User with id ${userId} not found`);
		}

		const gamePassword = GamePassword.generate();
		const gamePasswordHashed = await this.hash.hash(gamePassword.value);

		await this.repository.update(user.updatePassword(gamePasswordHashed));

		return { gamePassword: gamePassword.value };
	}
}
