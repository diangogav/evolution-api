import {
	CardAlternates,
	CardAlternatesSource,
	DeckValidation,
	FormatList,
	FormatListId,
	FormatListSource,
	validateDeck,
} from "../../community-decks";
import { DeckLegalityChecker } from "../domain/DeckLegalityChecker";
import { LightningDeck } from "../domain/LightningEntry";
import { LightningFormat } from "../domain/LightningTournament";

const LIST_OF: Record<LightningFormat, FormatListId> = { tcg: "tcg", edison: "edison", jtp: "jtp" };

type Cached<T> = { value: T; fetchedAt: number };

/**
 * The community decks' validation, against the same remote lists the client loads. Lists
 * are cached for `ttlMs` so registrations never wait on a download, and a failed refresh
 * keeps the last good copy: the server checks the deck again at join anyway.
 */
export class CommunityDeckLegalityChecker implements DeckLegalityChecker {
	private readonly lists = new Map<FormatListId, Cached<FormatList>>();
	private alternates: Cached<CardAlternates> | null = null;

	constructor(
		private readonly formatLists: FormatListSource,
		private readonly alternatesSource: CardAlternatesSource,
		private readonly ttlMs: number,
		private readonly clock: () => number = () => Date.now(),
	) {}

	async check(format: LightningFormat, deck: LightningDeck): Promise<DeckValidation> {
		const id = LIST_OF[format];
		const list = await this.fresh(
			this.lists.get(id),
			() => this.formatLists.fetch(id),
			(value) => this.lists.set(id, value),
		);
		const alternates = await this.fresh(
			this.alternates,
			() => this.alternatesSource.fetch(),
			(value) => {
				this.alternates = value;
			},
		);
		return validateDeck(deck, list, alternates);
	}

	private async fresh<T>(
		cached: Cached<T> | null | undefined,
		load: () => Promise<T>,
		store: (value: Cached<T>) => void,
	): Promise<T> {
		const now = this.clock();
		if (cached && now - cached.fetchedAt <= this.ttlMs) return cached.value;
		try {
			const value = await load();
			store({ value, fetchedAt: now });
			return value;
		} catch (error) {
			if (cached) return cached.value;
			throw error;
		}
	}
}
