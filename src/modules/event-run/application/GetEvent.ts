import { NotFoundError } from "../../../shared/errors/NotFoundError";
import { AssetUrlSigner } from "../../assets/domain/AssetUrlSigner";
import { CosmeticRepository } from "../../catalog/domain/CosmeticRepository";
import { Locale, localize } from "../../rewards/domain/LocalizedText";
import { periodKey } from "../../rewards/domain/MissionPeriod";
import { EventAttemptRepository } from "../domain/EventAttemptRepository";
import { EventCatalogRepository } from "../domain/EventCatalogRepository";
import { isEventOpen, WaveTier } from "../domain/EventDefinition";
import { EventRunRepository } from "../domain/EventRunRepository";
import { PrizeTierView, toPrizeTierViews } from "./PrizeTierView";

export type GetEventInput = { userId: string; eventId: string; locale: Locale; now: Date };

export type EventView = {
	id: string;
	name: string;
	description: string;
	open: boolean;
	startsAt: string;
	endsAt: string;
	attemptsPerDay: number;
	attemptsLeftToday: number;
	/** Most waves the player cleared in any run of this event. */
	bestMark: number;
	/** Each wave's difficulty and the bots its rival is drawn from. */
	waves: Array<{ wave: number; tier: WaveTier; pool: string[] }>;
	decks: Array<{ id: string; name: string }>;
	prizeTiers: PrizeTierView[];
};

export class GetEvent {
	constructor(
		private readonly catalog: EventCatalogRepository,
		private readonly runs: EventRunRepository,
		private readonly attempts: EventAttemptRepository,
		private readonly cosmetics: Pick<CosmeticRepository, "findById">,
		private readonly signer: Pick<AssetUrlSigner, "signManifest">,
	) {}

	async run(input: GetEventInput): Promise<EventView> {
		const event = await this.catalog.findById(input.eventId);
		if (!event) throw new NotFoundError(`Event "${input.eventId}" not found`);

		const [used, bestMark, prizeTiers] = await Promise.all([
			this.attempts.used(input.userId, event.id, periodKey("daily", input.now)),
			this.runs.bestMark(input.userId, event.id),
			toPrizeTierViews(event.prizeTiers, this.cosmetics, this.signer),
		]);

		return {
			id: event.id,
			name: localize(event.name, input.locale),
			description: localize(event.description, input.locale),
			open: isEventOpen(event, input.now),
			startsAt: event.startsAt.toISOString(),
			endsAt: event.endsAt.toISOString(),
			attemptsPerDay: event.attemptsPerDay,
			attemptsLeftToday: Math.max(0, event.attemptsPerDay - used),
			bestMark,
			waves: event.waves.map((wave, index) => ({
				wave: index + 1,
				tier: wave.tier,
				pool: [...wave.pool],
			})),
			decks: event.decks.map((deck) => ({ id: deck.id, name: localize(deck.name, input.locale) })),
			prizeTiers,
		};
	}
}
