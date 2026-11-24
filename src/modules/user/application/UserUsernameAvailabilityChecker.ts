import { UserRepository } from "../domain/UserRepository";

export class UserUsernameAvailabilityChecker {
	constructor(private readonly repository: UserRepository) {}

	async check({ username }: { username: string }): Promise<{ available: boolean }> {
		const taken = await this.repository.isUsernameTaken(username);

		return { available: !taken };
	}
}
