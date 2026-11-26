import type { QueryableManager } from "../../../shared/persistence/QueryableManager";
import { LightningFormat } from "./LightningTournament";

/** A users row that a WindBot plays: the bot the duel server requests for it, by name. */
export type LightningBotAccount = { userId: string; format: string; botName: string };

export interface LightningBotAccountRepository {
	/** The format's bots in their fixed order. */
	listByFormat(format: LightningFormat, manager?: QueryableManager): Promise<LightningBotAccount[]>;
}

// A tournament needs two humans to start with bots: a lone player against bots would be a
// prize run nobody else can contest.
export const MIN_HUMAN_ENTRIES = 2;

/**
 * The bots that join a tournament about to start: as many as the field lacks to reach its
 * minimum, in roster order, none twice. Nothing when the humans are too few or the field is
 * already full enough; fewer when the roster runs out, and the tournament starts anyway.
 */
export function botsToFill(input: {
	humanEntries: number;
	activeEntries: number;
	minPlayers: number;
	registeredUserIds: ReadonlySet<string>;
	roster: readonly LightningBotAccount[];
}): LightningBotAccount[] {
	if (input.humanEntries < MIN_HUMAN_ENTRIES) return [];
	const missing = input.minPlayers - input.activeEntries;
	if (missing <= 0) return [];
	return input.roster.filter((bot) => !input.registeredUserIds.has(bot.userId)).slice(0, missing);
}
