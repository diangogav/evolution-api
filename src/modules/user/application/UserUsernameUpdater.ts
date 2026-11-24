import { ConflictError } from "../../../shared/errors/ConflictError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { TooManyRequestsError } from "../../../shared/errors/TooManyRequestsError";
import { UserRepository } from "../domain/UserRepository";
import { nextUsernameChangeAt, UsernameChangeRepository } from "../domain/UsernameChange";

export class UserUsernameUpdater {
	constructor(
		private readonly repository: UserRepository,
		private readonly usernameChanges: UsernameChangeRepository,
	) {}

	async updateUsername({
		id,
		username,
		now,
	}: {
		id: string;
		username: string;
		now: Date;
	}): Promise<void> {
		const user = await this.repository.findById(id);

		if (!user) {
			throw new NotFoundError(`user with id ${id} not found`);
		}

		const previousUsername = user.username;
		const changesName = username !== previousUsername;

		// Only a new name is checked: accounts created before names were compared
		// ignoring case may share theirs with another account and must keep it.
		if (changesName) {
			if (await this.repository.isUsernameTaken(username, id)) {
				throw new ConflictError(`username ${username} is already taken`);
			}

			const lastChangeAt = await this.usernameChanges.lastChangeAt(id);
			const allowedFrom = lastChangeAt ? nextUsernameChangeAt(lastChangeAt) : null;
			if (allowedFrom && now < allowedFrom) {
				throw new TooManyRequestsError(
					`the username can be changed again on ${allowedFrom.toISOString().slice(0, 10)}`,
				);
			}
		}

		user.updateUsername(username);

		await this.repository.update(user);

		// Recorded after the rename so a failed update never starts a cooldown.
		if (changesName) {
			await this.usernameChanges.record({
				userId: id,
				previousUsername,
				newUsername: username,
				changedAt: now,
			});
		}
	}
}
