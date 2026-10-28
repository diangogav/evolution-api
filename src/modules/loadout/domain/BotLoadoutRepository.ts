import { LoadoutItem } from "./Loadout";

// Slots equipped by a WindBot bot, keyed by its exact botlist name. Bots are not users,
// so their loadouts live apart from user_loadouts and are only ever read.
export interface BotLoadoutRepository {
	findByBotName(botName: string): Promise<LoadoutItem[]>;
}
