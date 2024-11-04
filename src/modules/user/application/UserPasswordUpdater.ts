import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { InvalidArgumentError } from "../../../shared/errors/InvalidArgumentError";
import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { Hash } from "../../../shared/Hash";
import { UserRepository } from "../domain/UserRepository";

export class UserPasswordUpdater {
	constructor(
		private readonly repository: UserRepository,
		private readonly hash: Hash,
	) {}

	async updatePassword({
		id,
		password,
		newPassword,
	}: {
		id: string;
		password: string;
		newPassword: string;
	}): Promise<void> {
		const user = await this.repository.findById(id);

		if (!user) {
			throw new NotFoundError(`user with id ${id} not found`);
		}

		const isCorrectPassword = await this.hash.compare(password, user.password);

		if (!isCorrectPassword) {
			throw new AuthenticationError("Wrong password");
		}

		if (newPassword.length !== 4) {
			throw new InvalidArgumentError(`password must have a length of 4`);
		}

		const passwordHashed = await this.hash.hash(newPassword);
		const userUpdated = user.updatePassword(passwordHashed);
		await this.repository.update(userUpdated);
	}
}
