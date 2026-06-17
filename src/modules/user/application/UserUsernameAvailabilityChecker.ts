import { UserRepository } from "../domain/UserRepository";

export class UserUsernameAvailabilityChecker {
	constructor(private readonly repository: UserRepository) {}

	async check({ username }: { username: string }): Promise<{ available: boolean }> {
		const user = await this.repository.findByUsername(username);

		return { available: user === null };
	}
}
