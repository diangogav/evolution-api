import type { CardAlternates } from "../domain/CardAlternates";
import type { CardAlternatesSource } from "../domain/CardAlternatesSource";
import { parseCardAlternates } from "./parseCardAlternates";

export const CARD_ALTERNATES_URL =
	"https://raw.githubusercontent.com/diangogav/evolution-assets/main/cdb/alternates.json";

export class HttpCardAlternatesSource implements CardAlternatesSource {
	constructor(private readonly getJson: (url: string) => Promise<unknown>) {}

	async fetch(): Promise<CardAlternates> {
		return parseCardAlternates(await this.getJson(CARD_ALTERNATES_URL));
	}
}
