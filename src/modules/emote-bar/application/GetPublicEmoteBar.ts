import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { UserDirectory } from "../../loadout/domain/UserDirectory";
import { EmoteBarView, GetMyEmoteBar } from "./GetMyEmoteBar";

// Public, read-only emote bar of a player addressed by username — used to play an
// opponent's pack emotes during a duel. A missing username is a 404.
export class GetPublicEmoteBar {
	constructor(
		private readonly users: UserDirectory,
		private readonly emoteBar: Pick<GetMyEmoteBar, "run">,
	) {}

	async run(username: string): Promise<EmoteBarView> {
		const userId = await this.users.findUserIdByUsername(username);
		if (!userId) {
			throw new NotFoundError(`User ${username} not found`);
		}

		return this.emoteBar.run(userId);
	}
}
