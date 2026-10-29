import type { Logger } from "../../../shared/logger/domain/Logger";
import type { CardAlternates } from "../domain/CardAlternates";
import type { CardAlternatesSource } from "../domain/CardAlternatesSource";
import type { CommunityDeck } from "../domain/CommunityDeck";
import {
	COMMUNITY_DECK_CATEGORIES,
	type CommunityDeckCategory,
} from "../domain/CommunityDeckCategory";
import type { CommunityDeckRepository } from "../domain/CommunityDeckRepository";
import type { CommunityDeckSource } from "../domain/CommunityDeckSource";
import { curateDeck } from "../domain/curateDeck";
import type { FormatListSource } from "../domain/FormatListSource";
import type { SyncLock } from "../domain/SyncLock";

export type SyncCommunityDecksDependencies = {
	source: CommunityDeckSource;
	formatLists: FormatListSource;
	alternates: CardAlternatesSource;
	repository: CommunityDeckRepository;
	lock: SyncLock;
	logger: Logger;
	edisonMinViews: number;
	/** Minimum time between two syncs, measured from the last stored sync. */
	intervalMs: number;
};

export type CategorySyncResult =
	| {
			category: string;
			status: "synced";
			fetched: number;
			stored: number;
			rejected: number;
			duplicates: number;
			removed: number;
	  }
	| { category: string; status: "failed"; reason: string };

export type SyncCommunityDecksResult = {
	status: "synced" | "fresh" | "locked" | "failed";
	categories: CategorySyncResult[];
};

const SOURCE = "ygoprodeck";

// Each category is replaced all or nothing: a fetch or list failure skips it and keeps its
// rows, so decks are only removed after a complete, successful read of their category.
export class SyncCommunityDecks {
	constructor(private readonly deps: SyncCommunityDecksDependencies) {}

	async run(now: Date): Promise<SyncCommunityDecksResult> {
		const result = await this.deps.lock.runExclusive(() => this.syncUnlocked(now));
		return result ?? { status: "locked", categories: [] };
	}

	private async syncUnlocked(now: Date): Promise<SyncCommunityDecksResult> {
		const last = await this.deps.repository.lastSyncedAt(SOURCE);
		if (last && now.getTime() - last.getTime() < this.deps.intervalMs) {
			return { status: "fresh", categories: [] };
		}

		let alternates: CardAlternates;
		try {
			alternates = await this.deps.alternates.fetch();
		} catch (error) {
			this.deps.logger.error(
				`Community decks sync skipped: card alternates unavailable (${message(error)})`,
			);
			return { status: "failed", categories: [] };
		}

		const categories: CategorySyncResult[] = [];
		for (const category of COMMUNITY_DECK_CATEGORIES) {
			try {
				categories.push(await this.syncCategory(category, alternates, now));
			} catch (error) {
				this.deps.logger.error(
					`Community decks category "${category.category}" skipped: ${message(error)}`,
				);
				categories.push({ category: category.category, status: "failed", reason: message(error) });
			}
		}
		return { status: "synced", categories };
	}

	private async syncCategory(
		category: CommunityDeckCategory,
		alternates: CardAlternates,
		now: Date,
	): Promise<CategorySyncResult> {
		const list = await this.deps.formatLists.fetch(category.list);
		const fetched = await this.deps.source.fetchCategory(category.category);
		// An empty answer is far likelier an upstream hiccup than every deck vanishing.
		if (fetched.length === 0) throw new Error("the source returned no decks");

		const rules = { alternates, edisonMinViews: this.deps.edisonMinViews };
		const byContent = new Map<string, CommunityDeck>();
		let rejected = 0;
		for (const sourceDeck of fetched) {
			const curated = curateDeck(sourceDeck, category, list, rules);
			if (!curated.accepted) {
				rejected++;
				continue;
			}
			const existing = byContent.get(curated.deck.contentHash);
			if (!existing || curated.deck.views > existing.views) {
				byContent.set(curated.deck.contentHash, curated.deck);
			}
		}
		const decks = [...byContent.values()];
		const { removed } = await this.deps.repository.replaceCategory(
			SOURCE,
			category.category,
			decks,
			now,
		);
		return {
			category: category.category,
			status: "synced",
			fetched: fetched.length,
			stored: decks.length,
			rejected,
			duplicates: fetched.length - rejected - decks.length,
			removed,
		};
	}
}

const message = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
