import { BotLoadoutRepository } from "../domain/BotLoadoutRepository";
import { GetMyLoadout, MyLoadoutSlot } from "./GetMyLoadout";

// Public, read-only loadout of a WindBot bot, rendered as the opponent's look in a duel.
// An unknown bot answers an empty loadout, the same as a user with nothing equipped, so
// the client falls back to the standard look slot by slot.
export class GetBotLoadout {
	constructor(
		private readonly bots: BotLoadoutRepository,
		private readonly slots: Pick<GetMyLoadout, "signSlots">,
	) {}

	async run(botName: string): Promise<MyLoadoutSlot[]> {
		return this.slots.signSlots(await this.bots.findByBotName(botName));
	}
}
