import type { SourceDeck } from "../domain/SourceDeck";

export const YGOPRODECK_DECK_URL = "https://ygoprodeck.com/deck/";

const PASSCODE = /^\d+$/;

// One page of getDecks.php. Lists arrive as JSON-encoded arrays of passcode strings, a
// missing extra or side deck is empty, and an entry we cannot read is dropped rather than
// failing the category.
export function parseYgoProDeckPage(body: unknown, now: Date): SourceDeck[] {
	if (!Array.isArray(body)) throw new Error("YGOPRODeck answered something other than a deck list");
	const decks: SourceDeck[] = [];
	for (const entry of body) {
		const deck = parseEntry(entry, now);
		if (deck) decks.push(deck);
	}
	return decks;
}

function parseEntry(entry: unknown, now: Date): SourceDeck | null {
	if (typeof entry !== "object" || entry === null) return null;
	const raw = entry as Record<string, unknown>;
	const main = parseList(raw.main_deck);
	const extra = raw.extra_deck == null ? [] : parseList(raw.extra_deck);
	const side = raw.side_deck == null ? [] : parseList(raw.side_deck);
	if (!main || !extra || !side) return null;
	if (typeof raw.deckNum !== "number" || typeof raw.pretty_url !== "string") return null;
	const cover = String(raw.cover_card ?? "");
	return {
		sourceId: String(raw.deckNum),
		name: String(raw.deck_name ?? "").trim(),
		author: String(raw.username ?? "").trim(),
		url: `${YGOPRODECK_DECK_URL}${raw.pretty_url}`,
		cover: PASSCODE.test(cover) ? Number(cover) : null,
		main,
		extra,
		side,
		views: typeof raw.deck_views === "number" ? raw.deck_views : 0,
		sourceUpdatedAt: parseRelativeDate(
			typeof raw.edit_date === "string" ? raw.edit_date : asString(raw.submit_date),
			now,
		),
	};
}

function parseList(value: unknown): number[] | null {
	let list: unknown = value;
	if (typeof value === "string") {
		try {
			list = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (!Array.isArray(list)) return null;
	const cards: number[] = [];
	for (const card of list) {
		const text = String(card);
		if (!PASSCODE.test(text)) return null;
		cards.push(Number(text));
	}
	return cards;
}

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const RELATIVE = /^(\d+|an?|a few)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i;
const UNIT_MS = {
	second: 1_000,
	minute: 60_000,
	hour: 3_600_000,
	day: 86_400_000,
	week: 604_800_000,
};

// YGOPRODeck shows dates as "5 hours ago" / "2 weeks ago"; older ones may be absolute.
export function parseRelativeDate(text: string | null, now: Date): Date | null {
	if (!text) return null;
	const match = RELATIVE.exec(text.trim());
	if (!match) {
		const absolute = Date.parse(text);
		return Number.isNaN(absolute) ? null : new Date(absolute);
	}
	const amount = /^\d+$/.test(match[1])
		? Number(match[1])
		: match[1].toLowerCase() === "a few"
			? 3
			: 1;
	const unit = match[2].toLowerCase() as keyof typeof UNIT_MS | "month" | "year";
	const date = new Date(now);
	if (unit === "month") date.setUTCMonth(date.getUTCMonth() - amount);
	else if (unit === "year") date.setUTCFullYear(date.getUTCFullYear() - amount);
	else date.setTime(date.getTime() - amount * UNIT_MS[unit]);
	return date;
}
