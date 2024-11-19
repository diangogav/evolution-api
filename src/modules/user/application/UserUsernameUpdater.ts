import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UserRepository } from "../domain/UserRepository";

export class UserUsernameUpdater {
	constructor(private readonly repository: UserRepository) {}

	async updateUsername({ id, username }: { id: string; username: string }): Promise<void> {
		const user = await this.repository.findById(id);

		if (!user) {
			throw new NotFoundError(`user with id ${id} not found`);
		}

		user.updateUsername(username);

		await this.repository.update(user);
	}
}
