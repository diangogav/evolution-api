import type { CosmeticUsage, CosmeticUsageSource } from "../../modules/catalog";
import type { EventCatalogListing } from "../../modules/event-run";
import type { BotLoadoutListing } from "../../modules/loadout/domain/BotLoadoutRepository";

/**
 * Gathers where each cosmetic is used from the modules that know: the bots that wear it
 * and the events that give it away. The catalog shows it; it does not own either fact.
 */
export function buildCosmeticUsage(
	bots: BotLoadoutListing,
	events: EventCatalogListing,
): CosmeticUsageSource {
	return {
		async usage() {
			const [loadouts, definitions] = await Promise.all([bots.list(), events.list()]);
			const usage = new Map<
				string,
				{ bots: string[]; prizeOf: CosmeticUsage["prizeOf"][number][] }
			>();
			const of = (cosmeticId: string) => {
				let entry = usage.get(cosmeticId);
				if (!entry) {
					entry = { bots: [], prizeOf: [] };
					usage.set(cosmeticId, entry);
				}
				return entry;
			};
			for (const { botName, cosmeticId } of loadouts) {
				const entry = of(cosmeticId);
				if (!entry.bots.includes(botName)) entry.bots.push(botName);
			}
			for (const event of definitions) {
				const prizes = new Set(event.prizeTiers.flatMap((tier) => tier.cosmeticIds));
				for (const cosmeticId of prizes) {
					of(cosmeticId).prizeOf.push({ eventId: event.id, name: event.name.en });
				}
			}
			return usage;
		},
	};
}
