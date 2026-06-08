import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UserDirectory } from "../domain/UserDirectory";
import { GetMyLoadout, MyLoadoutSlot } from "./GetMyLoadout";

// Public, read-only loadout of a player addressed by username — used to render an
// opponent's cosmetics during a duel. A missing username is a 404 so the client can
// fall back to the standard look.
export class GetPublicLoadout {
	constructor(
		private readonly users: UserDirectory,
		private readonly myLoadout: GetMyLoadout,
	) {}

	async run(username: string): Promise<MyLoadoutSlot[]> {
		const userId = await this.users.findUserIdByUsername(username);
		if (!userId) {
			throw new NotFoundError(`User ${username} not found`);
		}

		return this.myLoadout.run(userId);
	}
}
