import type { FormatListId } from "../domain/CommunityDeckCategory";
import type { FormatList } from "../domain/FormatList";
import type { FormatListSource } from "../domain/FormatListSource";
import { isNewestTcgSection, parseLflist } from "./parseLflist";

const EVOLUTION_ASSETS = "https://raw.githubusercontent.com/diangogav/evolution-assets/main";

// The same lists the client validates decks with: the moecube base list for TCG and the
// evolution-assets lists for Edison (whitelist with our errata ids), Genesys and JTP.
// TCG also reads evolution-assets' bridge, which publishes a new TCG list before the base
// list ships it; the newest dated list wins, the base list on a tie, as in the client.
export const FORMAT_LISTS: Record<
	FormatListId,
	{ urls: readonly string[]; section: (header: string) => boolean }
> = {
	tcg: {
		urls: [
			"https://cdntx.moecube.com/ygopro-database/zh-CN/lflist.conf",
			`${EVOLUTION_ASSETS}/lflist/tcg.lflist.conf`,
		],
		section: isNewestTcgSection,
	},
	genesys: {
		urls: [`${EVOLUTION_ASSETS}/lflist/genesys.lflist.conf`],
		section: (header) => header === "Genesys",
	},
	edison: {
		urls: [`${EVOLUTION_ASSETS}/lflist/edison.lflist.conf`],
		section: (header) => header === "2010.3 Edison",
	},
	jtp: {
		urls: [`${EVOLUTION_ASSETS}/lflist/jtp.lflist.conf`],
		section: (header) => header === "JTP",
	},
};

export class HttpFormatListSource implements FormatListSource {
	constructor(private readonly getText: (url: string) => Promise<string>) {}

	async fetch(id: FormatListId): Promise<FormatList> {
		const { urls, section } = FORMAT_LISTS[id];
		const loaded = await Promise.allSettled(urls.map((url) => this.getText(url)));
		let newest: FormatList | null = null;
		for (const result of loaded) {
			if (result.status !== "fulfilled") continue;
			const list = parseLflist(result.value, section);
			if (list && (!newest || listDate(list.label) > listDate(newest.label))) newest = list;
		}
		if (newest) return newest;
		const failure = loaded.find((result) => result.status === "rejected");
		if (failure) throw failure.reason;
		throw new Error(`No ${id} section in ${urls.join(", ")}`);
	}
}

/** `2026.10 TCG` → 202610; a label without a date sorts first. */
function listDate(label: string): number {
	const date = /^(\d{4})\.(\d{1,2})\b/.exec(label);
	return date ? Number(date[1]) * 100 + Number(date[2]) : -1;
}
